"use client";

import Link from "next/link";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mt-2">
          An unexpected error occurred loading this page. You can try again, or head back to the
          project list.
        </p>
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={reset}
            className="rounded-lg border border-border text-sm font-medium px-4 py-2 hover:bg-muted"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg bg-primary text-background text-sm font-medium px-4 py-2 hover:opacity-90"
          >
            Back to Projects
          </Link>
        </div>
      </main>
    </div>
  );
}
