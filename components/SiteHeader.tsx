"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SiteHeader() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-semibold text-slate-900">
          HTA Multifamily Invoicing
        </Link>
        <button
          onClick={handleLogout}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
