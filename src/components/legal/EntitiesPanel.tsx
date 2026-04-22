import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, Calendar, DollarSign, ListTodo, MapPin } from "lucide-react";
import { toast } from "sonner";

interface Props { documentId: string }
interface Entities {
  parties: string[]; dates: string[]; money: string[]; obligations: string[]; locations: string[];
}

export function EntitiesPanel({ documentId }: Props) {
  const [data, setData] = useState<Entities | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: cached } = await supabase.from("analysis_results")
          .select("data").eq("document_id", documentId).eq("kind", "entities").maybeSingle();
        if (cached) { setData(cached.data as any); return; }
        const { data: res, error } = await supabase.functions.invoke("analyze", {
          body: { document_id: documentId, kind: "entities" },
        });
        if (error) throw error;
        if (res?.error) throw new Error(res.error);
        setData(res.data);
      } catch (e: any) { toast.error(e.message); }
      finally { setLoading(false); }
    })();
  }, [documentId]);

  if (loading) return (
    <div className="flex items-center gap-3 rounded border border-border bg-card p-8 shadow-paper">
      <Loader2 className="h-5 w-5 animate-spin text-accent" /><span className="text-muted-foreground">Extracting entities…</span>
    </div>
  );
  if (!data) return null;

  const groups = [
    { label: "Parties", items: data.parties, Icon: Users },
    { label: "Dates", items: data.dates, Icon: Calendar },
    { label: "Money", items: data.money, Icon: DollarSign },
    { label: "Obligations", items: data.obligations, Icon: ListTodo },
    { label: "Locations", items: data.locations, Icon: MapPin },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map(({ label, items, Icon }) => (
        <div key={label} className="rounded border border-border bg-card p-5 shadow-paper">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <Icon className="h-4 w-4 text-accent" />
            <h4 className="font-display text-lg text-primary">{label}</h4>
            <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
          </div>
          {items.length === 0 ? (
            <p className="mt-3 text-sm italic text-muted-foreground">None detected.</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {items.map((it, i) => (
                <li key={i} className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">{it}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
