import { useCallback, useState } from "react";
import { Upload, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Props {
  onReady: (documentId: string, sessionId: string, filename: string) => void;
}

export function UploadCard({ onReady }: Props) {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [drag, setDrag] = useState(false);

  const handle = useCallback(async (file: File) => {
    if (!file) return;
    const ok = file.name.toLowerCase().endsWith(".pdf") || file.name.toLowerCase().endsWith(".txt");
    if (!ok) { toast.error("Only PDF and TXT files are supported."); return; }
    if (file.size > 25 * 1024 * 1024) { toast.error("File too large (max 25 MB)."); return; }

    setBusy(true);
    try {
      const session_id = crypto.randomUUID();
      const path = `${session_id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

      setStage("Uploading file…");
      const { error: upErr } = await supabase.storage.from("legal-docs").upload(path, file, {
        contentType: file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "text/plain"),
      });
      if (upErr) throw upErr;

      setStage("Registering document…");
      const { data: doc, error: insErr } = await supabase.from("documents").insert({
        session_id, filename: file.name, storage_path: path, status: "processing",
      }).select().single();
      if (insErr) throw insErr;

      setStage("Extracting text & indexing…");
      const { data: proc, error: procErr } = await supabase.functions.invoke("process-document", {
        body: { document_id: doc.id },
      });
      if (procErr) throw procErr;
      if (proc?.error) throw new Error(proc.error);

      toast.success(`Indexed ${proc.pages} pages, ${proc.chunks} chunks.`);
      onReady(doc.id, session_id, file.name);
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
      setStage("");
    }
  }, [onReady]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault(); setDrag(false);
        const f = e.dataTransfer.files?.[0]; if (f) handle(f);
      }}
      className={`relative rounded-lg border-2 border-dashed p-12 text-center bg-card shadow-paper transition-colors ${drag ? "border-accent bg-accent/5" : "border-border"}`}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-full bg-ink p-4 shadow-ink">
          {busy ? <Loader2 className="h-7 w-7 animate-spin text-primary-foreground" /> : <Upload className="h-7 w-7 text-primary-foreground" />}
        </div>
        <div>
          <h3 className="font-display text-2xl text-foreground">Upload a legal document</h3>
          <p className="mt-1 text-sm text-muted-foreground">PDF or TXT • Up to 25 MB • Anonymous & session-scoped</p>
        </div>
        {busy ? (
          <p className="text-sm font-medium text-foreground">{stage}</p>
        ) : (
          <label>
            <input
              type="file" accept=".pdf,.txt,application/pdf,text/plain" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }}
            />
            <Button asChild variant="default" size="lg" className="cursor-pointer bg-ink shadow-ink">
              <span><FileText className="mr-2 h-4 w-4" />Choose file</span>
            </Button>
          </label>
        )}
      </div>
    </div>
  );
}
