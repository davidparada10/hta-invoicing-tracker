// Pure helpers (safe to import from client components) for the developer page address.

// Developer names are typed by hand, so the page address uses a plain slug of
// the name ("Hi Point - Winnie Zhang" -> "hi-point-winnie-zhang").
export function groupSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function findGroupBySlug(slug: string, names: (string | null | undefined)[]): string | null {
  const wanted = groupSlug(decodeURIComponent(slug));
  if (!wanted) return null;
  for (const n of names) {
    if (n && groupSlug(n) === wanted) return n;
  }
  return null;
}
