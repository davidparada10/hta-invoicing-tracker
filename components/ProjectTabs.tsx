import Link from "next/link";

export default function ProjectTabs({
  projectId,
  active,
}: {
  projectId: string;
  active: "draws" | "invoices";
}) {
  const tabs: { key: "draws" | "invoices"; label: string }[] = [
    { key: "draws", label: "Owner Draws" },
    { key: "invoices", label: "Sub Invoices" },
  ];

  return (
    <div className="border-b border-slate-200 flex gap-6">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.key === "draws" ? `/projects/${projectId}` : `/projects/${projectId}?tab=invoices`}
          className={`pb-3 text-sm font-medium border-b-2 -mb-px ${
            active === t.key
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
