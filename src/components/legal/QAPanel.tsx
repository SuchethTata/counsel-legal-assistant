import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Send, Loader2, MessageSquare, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Props { documentId: string }
interface Msg { question: string; answer: string; citations: { page: number }[] }

export function QAPanel({ documentId }: Props) {
  const [history, setHistory] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("qa_history")
        .select("question, answer, citations")
        .eq("document_id", documentId)
        .order("created_at", { ascending: true });
      if (data) setHistory(data.map(d => ({ ...d, citations: (d.citations as any) || [] })));
    })();
  }, [documentId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history, busy]);

  const ask = async () => {
    const question = q.trim();
    if (!question || busy) return;
    setQ(""); setBusy(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("analyze", {
        body: { document_id: documentId, kind: "qa", question },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error);
      setHistory(h => [...h, { question, answer: res.data.answer, citations: res.data.citations || [] }]);
    } catch (e: any) {
      toast.error(e.message);
      setQ(question);
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col rounded border border-border bg-card shadow-paper">
      <div className="max-h-[460px] min-h-[280px] flex-1 space-y-4 overflow-y-auto p-5">
        {history.length === 0 && !busy && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8" />
            <p className="font-display text-lg text-foreground">Ask anything about this document</p>
            <p className="text-sm">e.g. "What's the termination notice period?"</p>
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-lg bg-ink px-4 py-2 text-primary-foreground shadow-ink">
                {m.question}
              </div>
            </div>
            <div className="flex">
              <div className="max-w-[90%] rounded-lg border border-border bg-background px-4 py-3">
                <p className="whitespace-pre-wrap text-foreground">{m.answer}</p>
                {m.citations?.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
                    <BookOpen className="h-3 w-3" />
                    {m.citations.map((c, j) => (
                      <span key={j} className="rounded bg-secondary px-2 py-0.5 font-mono-pro">p.{c.page}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the document…
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 border-t border-border p-3">
        <Input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Ask a question…"
          onKeyDown={e => { if (e.key === "Enter") ask(); }}
          disabled={busy}
        />
        <Button onClick={ask} disabled={busy || !q.trim()} className="bg-ink shadow-ink">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
