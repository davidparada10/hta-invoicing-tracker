"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FloatingChat from "@/components/FloatingChat";

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
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-4">
          <Link href="/" className="inline-block">
            <Image
              src="/hta-logo.png"
              alt="HTA Construction"
              width={3840}
              height={2160}
              className="h-16 sm:h-20 w-auto"
              priority
            />
            <p className="text-sm font-bold text-slate-900 mt-1">Multi-Family Invoice Tracker</p>
          </Link>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-4 flex items-center justify-end">
          <div className="hidden sm:flex items-center gap-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-slate-500 hover:text-slate-900"
              >
                {link.label}
              </Link>
            ))}
            <button onClick={handleLogout} className="text-sm text-slate-500 hover:text-slate-900">
              Log out
            </button>
          </div>

          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="sm:hidden -mr-2 p-2 text-slate-500 hover:text-slate-900"
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

        {menuOpen && (
          <div className="sm:hidden border-t border-slate-200 px-4 py-3 flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="text-sm text-slate-600 hover:text-slate-900 py-2"
              >
                {link.label}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="text-sm text-slate-600 hover:text-slate-900 py-2 text-left"
            >
              Log out
            </button>
          </div>
        )}
      </header>
      <FloatingChat />
    </>
  );
}
