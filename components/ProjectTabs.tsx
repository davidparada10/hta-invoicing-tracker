import Link from "next/link";

export default function ProjectTabs({
  projectId,
  active,
}: {
  projectId: string;
  active: "draws" | "budget";
}) {
  const tabs: { key: "draws" | "budget"; label: string }[] = [
    { key: "draws", label: "Owner Draws" },
    { key: "budget", label: "Schedule of Values" },
  ];

  return (
    <div className="border-b border-border flex gap-6">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.key === "draws" ? `/projects/${projectId}` : `/projects/${projectId}?tab=${t.key}`}
          className={`pb-3 text-sm font-medium border-b-2 -mb-px ${
            active === t.key
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
