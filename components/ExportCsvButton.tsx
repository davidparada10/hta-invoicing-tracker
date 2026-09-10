"use client";

function toCsvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ExportCsvButton({
  filename,
  sections,
}: {
  filename: string;
  sections: { title: string; headers: string[]; rows: (string | number)[][] }[];
}) {
  function handleExport() {
    const lines: string[] = [];
    for (const section of sections) {
      lines.push(toCsvCell(section.title));
      lines.push(section.headers.map(toCsvCell).join(","));
      for (const row of section.rows) {
        lines.push(row.map(toCsvCell).join(","));
      }
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleExport}
      className="rounded border border-border bg-card text-foreground text-sm font-medium px-3 py-1.5 hover:bg-muted"
    >
      Export CSV
    </button>
  );
}
