import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

export async function exportReport(documentId: string, filename: string) {
  const { data: rows } = await supabase.from("analysis_results")
    .select("kind, data").eq("document_id", documentId);
  const map: Record<string, any> = {};
  (rows ?? []).forEach(r => { map[r.kind] = r.data; });

  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 48;
  let y = M;

  const ensure = (need = 20) => {
    if (y + need > H - M) { pdf.addPage(); y = M; }
  };
  const text = (s: string, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
    const { size = 11, bold = false, color = [20, 30, 50] } = opts;
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(s, W - 2 * M);
    for (const ln of lines) {
      ensure(size + 4);
      pdf.text(ln, M, y);
      y += size + 4;
    }
  };
  const heading = (s: string) => {
    ensure(40);
    y += 12;
    pdf.setDrawColor(200, 180, 140);
    pdf.line(M, y - 8, W - M, y - 8);
    text(s, { size: 18, bold: true, color: [30, 50, 90] });
    y += 4;
  };

  // Cover
  pdf.setFillColor(20, 30, 60);
  pdf.rect(0, 0, W, 120, "F");
  pdf.setTextColor(245, 240, 225);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text("Legal Document Analysis", M, 70);
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "normal");
  pdf.text(filename, M, 95);
  y = 160;
  text(`Generated ${new Date().toLocaleString()}`, { size: 10, color: [100, 100, 110] });

  if (map.summary) {
    heading("Summary");
    text("Overview", { size: 13, bold: true });
    text(map.summary.overview);
    text("Key Points", { size: 13, bold: true });
    map.summary.key_points.forEach((p: string) => text("• " + p));
    text("Important Clauses", { size: 13, bold: true });
    map.summary.important_clauses.forEach((c: any) => {
      text(c.title, { bold: true });
      text(c.description);
    });
  }
  if (map.risks?.risks?.length) {
    heading("Risks");
    map.risks.risks.forEach((r: any) => {
      text(`[${r.severity}] ${r.clause}`, { bold: true, color: r.severity === "HIGH" ? [180, 40, 40] : r.severity === "MEDIUM" ? [200, 120, 30] : [60, 120, 70] });
      text(`Excerpt: "${r.excerpt}"`);
      text(r.explanation);
      text("→ " + r.recommendation);
      y += 6;
    });
  }
  if (map.entities) {
    heading("Entities");
    const e = map.entities;
    [["Parties", e.parties], ["Dates", e.dates], ["Money", e.money], ["Obligations", e.obligations], ["Locations", e.locations]]
      .forEach(([label, items]: any) => {
        text(label, { bold: true });
        text(items.length ? items.join(" • ") : "—");
      });
  }

  pdf.save(filename.replace(/\.[^.]+$/, "") + "-analysis.pdf");
}
