"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={`inline-flex rounded-lg border border-border p-0.5 ${className}`}
        aria-hidden="true"
      >
        {OPTIONS.map((opt) => (
          <span
            key={opt.value}
            className="rounded-md px-2 py-1 text-xs font-medium text-transparent"
          >
            {opt.label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Color theme"
      className={`inline-flex rounded-lg border border-border p-0.5 ${className}`}
    >
      {OPTIONS.map((opt) => {
        const selected = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            aria-pressed={selected}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              selected
                ? "bg-primary text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
