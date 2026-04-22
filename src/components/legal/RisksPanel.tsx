import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface Props { documentId: string }
interface Risk {
  clause: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  excerpt: string;
  explanation: string;
  recommendation: string;
}

export function RisksPanel({ documentId }: Props) {
  const [risks, setRisks] = useState<Risk[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: cached } = await supabase.from("analysis_results")
          .select("data").eq("document_id", documentId).eq("kind", "risks").maybeSingle();
        if (cached) { setRisks((cached.data as any).risks); return; }
        const { data: res, error } = await supabase.functions.invoke("analyze", {
          body: { document_id: documentId, kind: "risks" },
        });
        if (error) throw error;
        if (res?.error) throw new Error(res.error);
        setRisks(res.data.risks);
      } catch (e: any) { toast.error(e.message); }
      finally { setLoading(false); }
    })();
  }, [documentId]);

  if (loading) return (
    <div className="flex items-center gap-3 rounded border border-border bg-card p-8 shadow-paper">
      <Loader2 className="h-5 w-5 animate-spin text-accent" /><span className="text-muted-foreground">Detecting risks…</span>
    </div>
  );
  if (!risks) return null;
  if (risks.length === 0) return (
    <div className="flex items-center gap-3 rounded border border-border bg-card p-8 shadow-paper">
      <ShieldCheck className="h-5 w-5 text-risk-low" /><span>No significant risks detected.</span>
    </div>
  );

  return (
    <div className="space-y-3">
      {risks.map((r, i) => <RiskCard key={i} r={r} />)}
    </div>
  );
}

function RiskCard({ r }: { r: Risk }) {
  const map = {
    HIGH: { color: "bg-risk-high/10 border-risk-high/30 text-risk-high", icon: ShieldAlert },
    MEDIUM: { color: "bg-risk-medium/10 border-risk-medium/30 text-risk-medium", icon: AlertTriangle },
    LOW: { color: "bg-risk-low/10 border-risk-low/30 text-risk-low", icon: ShieldCheck },
  } as const;
  const cfg = map[r.severity];
  const Icon = cfg.icon;
  return (
    <div className="rounded border border-border bg-card p-5 shadow-paper">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Icon className={`h-5 w-5 ${cfg.color.split(" ").pop()}`} />
          <h4 className="font-display text-lg text-foreground">{r.clause}</h4>
        </div>
        <span className={`rounded px-2 py-1 text-xs font-semibold border ${cfg.color}`}>{r.severity}</span>
      </div>
      <blockquote className="mt-3 border-l-2 border-border pl-3 text-sm italic text-muted-foreground">"{r.excerpt}"</blockquote>
      <p className="mt-3 text-sm text-foreground">{r.explanation}</p>
      <p className="mt-2 text-sm"><span className="font-semibold text-primary">Recommendation: </span>{r.recommendation}</p>
    </div>
  );
}
