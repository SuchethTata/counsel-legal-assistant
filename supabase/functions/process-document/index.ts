// Extracts text from an uploaded PDF/TXT in storage, chunks it, stores chunks in DB.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// @ts-ignore - npm specifier, legacy build avoids canvas
import * as pdfjs from "npm:pdfjs-dist@4.0.379/legacy/build/pdf.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// @ts-ignore
pdfjs.GlobalWorkerOptions.workerSrc = "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { document_id } = await req.json();
    if (!document_id) {
      return json({ error: "document_id required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: doc, error: docErr } = await supabase
      .from("documents").select("*").eq("id", document_id).maybeSingle();
    if (docErr || !doc) return json({ error: "document not found" }, 404);

    // Download file
    const { data: file, error: dlErr } = await supabase.storage
      .from("legal-docs").download(doc.storage_path);
    if (dlErr || !file) return json({ error: "download failed: " + dlErr?.message }, 500);

    const buf = new Uint8Array(await file.arrayBuffer());
    const isPdf = doc.filename.toLowerCase().endsWith(".pdf");

    let pages: { page: number; text: string }[] = [];

    if (isPdf) {
      // @ts-ignore
      const pdf = await pdfjs.getDocument({ data: buf, disableWorker: true, isEvalSupported: false, useSystemFonts: false }).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((it: any) => it.str).join(" ");
        pages.push({ page: i, text });
      }
    } else {
      const text = new TextDecoder().decode(buf);
      pages = [{ page: 1, text }];
    }

    const fullText = pages.map(p => p.text).join("\n\n");

    // Chunk: ~1200 chars per chunk, preserve page mapping
    const chunks: { chunk_index: number; page: number; content: string }[] = [];
    let idx = 0;
    for (const p of pages) {
      const target = 1200;
      const overlap = 150;
      const t = p.text;
      if (!t.trim()) continue;
      let start = 0;
      while (start < t.length) {
        const end = Math.min(start + target, t.length);
        chunks.push({ chunk_index: idx++, page: p.page, content: t.slice(start, end) });
        if (end === t.length) break;
        start = end - overlap;
      }
    }

    // Insert chunks
    if (chunks.length) {
      const rows = chunks.map(c => ({
        document_id,
        session_id: doc.session_id,
        chunk_index: c.chunk_index,
        page: c.page,
        content: c.content,
      }));
      for (let i = 0; i < rows.length; i += 100) {
        const slice = rows.slice(i, i + 100);
        const { error } = await supabase.from("document_chunks").insert(slice);
        if (error) return json({ error: "chunk insert: " + error.message }, 500);
      }
    }

    await supabase.from("documents").update({
      status: "ready",
      page_count: pages.length,
      full_text: fullText.slice(0, 500_000),
    }).eq("id", document_id);

    return json({ ok: true, pages: pages.length, chunks: chunks.length });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
