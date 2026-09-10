import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { INVEXA_LOGO_BASE64 } from "../assets/logoBase64";
import { apiFetch } from "../api/client";

type Transaction = {
  date: string;
  type: "BUY" | "SELL" | "DEPOSIT";
  description: string;
  ticker?: string;
  quantity?: number;
  rate?: number;
  amount: number;
};

type Input = {
  user: { id: string; username: string; email: string };
  token: string;
};

function inr(n: number) {
  return "Rs. " + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * jsPDF's built-in standard fonts (Helvetica/Times/Courier) only support the
 * WinAnsi single-byte character set — there's no glyph for the ₹ (Indian
 * Rupee) sign or a few other common punctuation marks. Passing those through
 * doesn't throw, it silently renders the wrong glyph instead (₹ comes out as
 * a stray "¹"), which is why a description like "Bought 5 share(s) of NSEI
 * at ₹2391.00" looked corrupted/cut off in the PDF. The Amount column
 * already avoids this by routing through `inr()` (which uses "Rs." instead
 * of ₹) — this does the same normalization for the free-text description.
 */
function pdfSafeText(text: string): string {
  return text
    .replace(/₹/g, "Rs. ")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/•/g, "-");
}

export async function downloadAccountStatementPdf({ user, token }: Input) {
  const { transactions } = await apiFetch<{ transactions: Transaction[] }>("/portfolio/transactions", {}, token);

  // Landscape gives the Description column roughly 3x the horizontal room
  // portrait did, so full transaction descriptions are comfortably visible
  // without needing a cramped, tiny font.
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  doc.addImage(INVEXA_LOGO_BASE64, "PNG", margin, 30, 46, 46);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Invexa", margin + 56, 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text("Account Statement", margin + 56, 68);

  doc.setDrawColor(220);
  doc.line(margin, 92, pageWidth - margin, 92);

  const generatedOn = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  doc.setTextColor(20);
  doc.setFontSize(11);
  let y = 116;
  const rows: Array<[string, string]> = [
    ["Account Holder", user.username],
    ["Account ID", user.id],
    ["Email", user.email],
    ["Statement Generated", generatedOn]
  ];
  rows.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(value), margin + 140, y);
    y += 18;
  });

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Transaction History", margin, y);
  y += 16;

  if (transactions.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("No transactions yet.", margin, y + 16);
  } else {
    autoTable(doc, {
      startY: y + 6,
      margin: { left: margin, right: margin },
      head: [["Sr.No", "Type", "Description", "Date", "Amount"]],
      body: transactions.map((t, idx) => [
        String(idx + 1),
        t.type,
        pdfSafeText(t.description),
        new Date(t.date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
        (t.type === "SELL" || t.type === "DEPOSIT" ? "+" : "-") + inr(Math.abs(t.amount))
      ]),
      theme: "striped",
      headStyles: { fillColor: [17, 20, 23], textColor: 255, fontStyle: "bold", fontSize: 10 },
      styles: { fontSize: 9.5, cellPadding: 7, overflow: "linebreak", valign: "top" },
      // Explicit widths for every column so autoTable doesn't shrink
      // Description to fit the others — it gets the lion's share of the
      // landscape page (roughly 3x its old portrait-mode width) since it's
      // the field most likely to need the room.
      columnStyles: {
        0: { cellWidth: 40, halign: "center" },
        1: { cellWidth: 60 },
        2: { cellWidth: 420, fontSize: 10 },
        3: { cellWidth: 120 },
        4: { cellWidth: 110, halign: "right" }
      },
      // Long descriptions can make a row taller than the space left on the
      // current page. The default "auto" row-break mode splits such a row
      // across pages, which cuts the description text mid-word and can even
      // drop whole rows. "avoid" instead pushes the entire row onto the next
      // page so every transaction's full description always renders intact.
      rowPageBreak: "avoid",
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 4) {
          const t = transactions[data.row.index];
          data.cell.styles.textColor = t.type === "BUY" ? [209, 60, 60] : [31, 157, 110];
        }
        if (data.section === "body" && data.column.index === 1) {
          const t = transactions[data.row.index];
          data.cell.styles.textColor = t.type === "BUY" ? [209, 60, 60] : t.type === "SELL" ? [31, 157, 110] : [90, 90, 90];
          data.cell.styles.fontStyle = "bold";
        }
      }
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      "This is a virtual paper-trading statement generated by Invexa. No real currency is involved.",
      margin,
      doc.internal.pageSize.getHeight() - 24
    );
  }

  doc.save(`invexa-statement-${user.username}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
