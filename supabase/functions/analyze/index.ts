// Single endpoint that handles: summary, risks, entities, qa
// Body: { document_id, kind: 'summary'|'risks'|'entities'|'qa', question? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { document_id, kind, question } = await req.json();
    if (!document_id || !kind) return json({ error: "document_id and kind required" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: doc } = await supabase.from("documents")
      .select("*").eq("id", document_id).maybeSingle();
    if (!doc) return json({ error: "document not found" }, 404);
    if (doc.status !== "ready") return json({ error: "document still processing" }, 409);

    // Cache lookup for non-qa kinds
    if (kind !== "qa") {
      const { data: cached } = await supabase.from("analysis_results")
        .select("data").eq("document_id", document_id).eq("kind", kind).maybeSingle();
      if (cached) return json({ data: cached.data, cached: true });
    }

    const fullText = (doc.full_text || "").slice(0, 60_000);

    if (kind === "summary") {
      const tool = {
        type: "function",
        function: {
          name: "return_summary",
          description: "Return structured legal document summary",
          parameters: {
            type: "object",
            properties: {
              overview: { type: "string", description: "2-4 sentence executive overview" },
              key_points: { type: "array", items: { type: "string" } },
              important_clauses: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                  },
                  required: ["title", "description"],
                  additionalProperties: false,
                },
              },
            },
            required: ["overview", "key_points", "important_clauses"],
            additionalProperties: false,
          },
        },
      };
      const data = await callAIStructured(LOVABLE_API_KEY, [
        { role: "system", content: "You are a legal analyst. Summarize the document precisely and factually." },
        { role: "user", content: `Summarize this legal document:\n\n${fullText}` },
      ], tool, "return_summary");
      await cache(supabase, document_id, doc.session_id, "summary", data);
      return json({ data });
    }

    if (kind === "risks") {
      const tool = {
        type: "function",
        function: {
          name: "return_risks",
          description: "Return risky clauses with severity",
          parameters: {
            type: "object",
            properties: {
              risks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    clause: { type: "string", description: "Short label e.g. 'Termination', 'Liability cap'" },
                    severity: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
                    excerpt: { type: "string", description: "Quoted text from doc (<= 280 chars)" },
                    explanation: { type: "string" },
                    recommendation: { type: "string" },
                  },
                  required: ["clause", "severity", "excerpt", "explanation", "recommendation"],
                  additionalProperties: false,
                },
              },
            },
            required: ["risks"],
            additionalProperties: false,
          },
        },
      };
      const data = await callAIStructured(LOVABLE_API_KEY, [
        { role: "system", content: "You are a legal risk analyst. Identify risky clauses: termination, liability, indemnity, penalties, auto-renewal, non-compete, IP assignment, governing law/jurisdiction concerns." },
        { role: "user", content: `Identify risks in this document:\n\n${fullText}` },
      ], tool, "return_risks");
      await cache(supabase, document_id, doc.session_id, "risks", data);
      return json({ data });
    }

    if (kind === "entities") {
      const tool = {
        type: "function",
        function: {
          name: "return_entities",
          description: "Extract entities",
          parameters: {
            type: "object",
            properties: {
              parties: { type: "array", items: { type: "string" } },
              dates: { type: "array", items: { type: "string" } },
              money: { type: "array", items: { type: "string" } },
              obligations: { type: "array", items: { type: "string" } },
              locations: { type: "array", items: { type: "string" } },
            },
            required: ["parties", "dates", "money", "obligations", "locations"],
            additionalProperties: false,
          },
        },
      };
      const data = await callAIStructured(LOVABLE_API_KEY, [
        { role: "system", content: "Extract named entities from legal text. Be exhaustive but no duplicates." },
        { role: "user", content: `Extract entities:\n\n${fullText}` },
      ], tool, "return_entities");
      await cache(supabase, document_id, doc.session_id, "entities", data);
      return json({ data });
    }

    if (kind === "qa") {
      if (!question || typeof question !== "string") return json({ error: "question required" }, 400);

      // naive retrieval: keyword score over chunks
      const { data: chunks } = await supabase.from("document_chunks")
        .select("chunk_index, page, content")
        .eq("document_id", document_id)
        .order("chunk_index", { ascending: true });

      const top = retrieveTopK(question, chunks || [], 6);
      const context = top.map(c => `[Page ${c.page}]\n${c.content}`).join("\n\n---\n\n");

      const tool = {
        type: "function",
        function: {
          name: "return_answer",
          description: "Answer with citations",
          parameters: {
            type: "object",
            properties: {
              answer: { type: "string" },
              citations: {
                type: "array",
                items: {
                  type: "object",
                  properties: { page: { type: "number" } },
                  required: ["page"],
                  additionalProperties: false,
                },
              },
            },
            required: ["answer", "citations"],
            additionalProperties: false,
          },
        },
      };

      const data = await callAIStructured(LOVABLE_API_KEY, [
        { role: "system", content: "Answer strictly using the provided context. If not in context, say you don't know. Cite page numbers." },
        { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` },
      ], tool, "return_answer");

      await supabase.from("qa_history").insert({
        document_id,
        session_id: doc.session_id,
        question,
        answer: data.answer,
        citations: data.citations || [],
      });

      return json({ data });
    }

    return json({ error: "unknown kind" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function tokenize(s: string) {
  return s.toLowerCase().match(/[a-z0-9]+/g) || [];
}
function retrieveTopK(q: string, chunks: any[], k: number) {
  const qTokens = new Set(tokenize(q));
  const scored = chunks.map(c => {
    const tokens = tokenize(c.content);
    let score = 0;
    for (const t of tokens) if (qTokens.has(t)) score++;
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const picked = scored.filter(s => s.score > 0).slice(0, k).map(s => s.c);
  if (picked.length === 0) return chunks.slice(0, Math.min(k, chunks.length));
  return picked;
}

async function callAIStructured(key: string, messages: any[], tool: any, name: string) {
  const resp = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: [tool],
      tool_choice: { type: "function", function: { name } },
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    if (resp.status === 429) throw new Error("Rate limited. Try again shortly.");
    if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in Lovable workspace.");
    throw new Error(`AI gateway ${resp.status}: ${t}`);
  }
  const json = await resp.json();
  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("No tool call returned");
  return JSON.parse(call.function.arguments);
}

async function cache(supabase: any, document_id: string, session_id: string, kind: string, data: any) {
  await supabase.from("analysis_results").upsert(
    { document_id, session_id, kind, data },
    { onConflict: "document_id,kind" },
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
