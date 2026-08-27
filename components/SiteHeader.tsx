"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FloatingChat from "@/components/FloatingChat";
import ThemeToggle from "@/components/ThemeToggle";

const NAV_LINKS = [
  { href: "/help", label: "How it works" },
  { href: "/workflow", label: "Workflow" },
  { href: "/billing", label: "Billing Summary" },
];

export default function SiteHeader() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <Link href="/" className="inline-block min-w-0">
              <Image
                src="/hta-logo.png"
                alt="HTA Construction"
                width={4745}
                height={1500}
                className="h-16 sm:h-20 w-auto"
                priority
              />
            </Link>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="sm:hidden -mr-2 p-2 text-muted-foreground hover:text-foreground"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="text-xl font-bold text-foreground min-w-0">
              Multi-Family Invoice Tracker
            </Link>
            <div className="hidden sm:flex items-center gap-4 shrink-0">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-base text-muted-foreground hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
              <button onClick={handleLogout} className="text-base text-muted-foreground hover:text-foreground">
                Log out
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>

        {menuOpen && (
          <div className="sm:hidden border-t border-border px-4 py-3 flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="text-base text-muted-foreground hover:text-foreground py-2"
              >
                {link.label}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="text-base text-muted-foreground hover:text-foreground py-2 text-left"
            >
              Log out
            </button>
            <div className="pt-2">
              <ThemeToggle />
            </div>
          </div>
        )}
      </header>
      <FloatingChat />
    </>
  );
}
