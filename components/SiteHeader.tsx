"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FloatingChat from "@/components/FloatingChat";

export default function SiteHeader() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/hta-logo.png"
              alt="HTA Construction"
              width={112}
              height={63}
              className="h-14 w-auto"
              priority
            />
            <span className="h-6 w-px bg-slate-200" aria-hidden="true" />
            <span className="font-semibold text-slate-900">Multi-Family Invoice Tracker</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/help" className="text-sm text-slate-500 hover:text-slate-900">
              How it works
            </Link>
            <Link href="/workflow" className="text-sm text-slate-500 hover:text-slate-900">
              Workflow
            </Link>
            <Link href="/billing" className="text-sm text-slate-500 hover:text-slate-900">
              Billing Summary
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <FloatingChat />
    </>
  );
}
