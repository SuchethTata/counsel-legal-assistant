import { useState } from "react";
import { Scale, Download, RotateCcw, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { UploadCard } from "@/components/legal/UploadCard";
import { SummaryPanel } from "@/components/legal/SummaryPanel";
import { RisksPanel } from "@/components/legal/RisksPanel";
import { EntitiesPanel } from "@/components/legal/EntitiesPanel";
import { QAPanel } from "@/components/legal/QAPanel";
import { exportReport } from "@/components/legal/exportReport";
import { toast } from "sonner";

interface Session {
  documentId: string;
  sessionId: string;
  filename: string;
}

const Index = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!session) return;
    setExporting(true);
    try { await exportReport(session.documentId, session.filename); toast.success("Report downloaded."); }
    catch (e: any) { toast.error(e.message ?? "Export failed"); }
    finally { setExporting(false); }
  };

  return (
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <header className="border-b border-border bg-ink">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3 text-primary-foreground">
            <Scale className="h-6 w-6 text-accent" />
            <div>
              <h1 className="font-display text-xl leading-none">Counsel<span className="text-accent">.</span></h1>
              <p className="text-xs text-primary-foreground/70">AI Legal Document Assistant</p>
            </div>
          </div>
          {session && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSession(null)} className="border-primary-foreground/20 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
                <RotateCcw className="mr-2 h-3.5 w-3.5" /> New document
              </Button>
              <Button variant="default" size="sm" onClick={handleExport} disabled={exporting} className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Download className="mr-2 h-3.5 w-3.5" /> {exporting ? "Generating…" : "Export PDF"}
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {!session ? (
          <div className="space-y-10">
            <div className="text-center">
              <p className="font-mono-pro text-xs uppercase tracking-widest text-accent">Confidential · Session-scoped</p>
              <h2 className="mt-3 font-display text-5xl leading-tight text-foreground md:text-6xl">
                Read every<br />
                <span className="italic text-accent">clause.</span> Understand every risk.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-muted-foreground">
                Upload a contract, NDA, or agreement. We'll summarise it, flag risks,
                extract the parties and obligations, and answer your questions — with citations.
              </p>
            </div>
            <UploadCard onReady={(documentId, sessionId, filename) => setSession({ documentId, sessionId, filename })} />
            <FeatureGrid />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-3 rounded border border-border bg-card px-4 py-3 shadow-paper">
              <FileText className="h-5 w-5 text-accent" />
              <div className="flex-1">
                <p className="font-display text-lg leading-none text-foreground">{session.filename}</p>
                <p className="mt-1 font-mono-pro text-xs text-muted-foreground">session: {session.sessionId.slice(0, 8)}…</p>
              </div>
            </div>
            <Tabs defaultValue="summary" className="w-full">
              <TabsList className="grid w-full grid-cols-4 bg-secondary">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="risks">Risks</TabsTrigger>
                <TabsTrigger value="qa">Q&amp;A</TabsTrigger>
                <TabsTrigger value="entities">Entities</TabsTrigger>
              </TabsList>
              <TabsContent value="summary" className="mt-6"><SummaryPanel documentId={session.documentId} /></TabsContent>
              <TabsContent value="risks" className="mt-6"><RisksPanel documentId={session.documentId} /></TabsContent>
              <TabsContent value="qa" className="mt-6"><QAPanel documentId={session.documentId} /></TabsContent>
              <TabsContent value="entities" className="mt-6"><EntitiesPanel documentId={session.documentId} /></TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        Counsel is a research aid, not legal advice. Documents are scoped to your anonymous session.
      </footer>
    </div>
  );
};

function FeatureGrid() {
  const items = [
    { t: "Structured summary", d: "Overview, key points, important clauses." },
    { t: "Risk detection", d: "Termination, liability, indemnity & more." },
    { t: "Cited Q&A", d: "Answers backed by page references." },
    { t: "Entity extraction", d: "Parties, dates, amounts, obligations." },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(i => (
        <div key={i.t} className="rounded border border-border bg-card p-5 shadow-paper">
          <h3 className="font-display text-lg text-primary">{i.t}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{i.d}</p>
        </div>
      ))}
    </div>
  );
}

export default Index;
