import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export default function NotFound() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Page not found</h1>
        <p className="text-sm text-muted-foreground mt-2">
          This page doesn&apos;t exist, or the project it links to may have been removed.
        </p>
        <Link
          href="/"
          className="inline-block mt-6 rounded-lg bg-primary text-background text-sm font-medium px-4 py-2 hover:opacity-90"
        >
          Back to Projects
        </Link>
      </main>
    </div>
  );
}
