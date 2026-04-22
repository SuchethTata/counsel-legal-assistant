import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props { documentId: string }

interface Summary {
  overview: string;
  key_points: string[];
  important_clauses: { title: string; description: string }[];
}

export function SummaryPanel({ documentId }: Props) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (force = false) => {
    setLoading(true);
    try {
      if (!force) {
        const { data: cached } = await supabase.from("analysis_results")
          .select("data").eq("document_id", documentId).eq("kind", "summary").maybeSingle();
        if (cached) { setData(cached.data as any); setLoading(false); return; }
      }
      const { data: res, error } = await supabase.functions.invoke("analyze", {
        body: { document_id: documentId, kind: "summary" },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error);
      setData(res.data);
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [documentId]);

  if (loading && !data) return <Loading label="Generating summary…" />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <Section title="Overview">
        <p className="leading-relaxed text-foreground">{data.overview}</p>
      </Section>
      <Section title="Key points">
        <ul className="space-y-2">
          {data.key_points.map((p, i) => (
            <li key={i} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{p}</li>
          ))}
        </ul>
      </Section>
      <Section title="Important clauses">
        <div className="grid gap-3 sm:grid-cols-2">
          {data.important_clauses.map((c, i) => (
            <div key={i} className="rounded border border-border bg-card p-4 shadow-paper">
              <h4 className="font-display text-lg text-foreground">{c.title}</h4>
              <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 font-display text-xl text-primary">{title}</h3>
      {children}
    </div>
  );
}
function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded border border-border bg-card p-8 shadow-paper">
      <Loader2 className="h-5 w-5 animate-spin text-accent" />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
