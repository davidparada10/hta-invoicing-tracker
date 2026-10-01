// Simplifies a project's address for display under its name on the
// dashboard table, when the project name already spells out the street
// (e.g. name "123 Main St" with address "123 Main St, Van Nuys, CA 91401,
// USA" → "Van Nuys · 91401"). Never used to decide what to store — only
// how to render what's already there.

const COUNTRY_SUFFIX = /,\s*(usa|united states)\s*$/i;
const ZIP_PATTERN = /\b(\d{5})(?:-\d{4})?\b/;

export function stripCountrySuffix(address: string): string {
  return address.replace(COUNTRY_SUFFIX, "").trim();
}

/**
 * Returns the line to show beneath a project name. Falls back to the full
 * (country-suffix-stripped) address whenever the name doesn't echo the
 * street, or the address doesn't parse into a confident city + ZIP — never
 * truncates through a guess, since the point is to identify the project,
 * not just to shorten the string.
 */
export function dashboardAddressLine(
  projectName: string,
  address: string | null | undefined
): string | null {
  if (!address) return null;
  const cleaned = stripCountrySuffix(address);
  if (!cleaned) return null;

  const parts = cleaned
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) return cleaned;

  const street = parts[0];
  const city = parts[parts.length - 2];
  const zipMatch = parts[parts.length - 1].match(ZIP_PATTERN);

  const nameContainsStreet =
    street.length >= 4 && projectName.toLowerCase().includes(street.toLowerCase());

  if (nameContainsStreet && city && zipMatch) {
    return `${city} · ${zipMatch[1]}`;
  }
  return cleaned;
}
