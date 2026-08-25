// Shared-passcode session helpers. Isolated here so this auth strategy can
// be swapped for real per-user auth later without touching app routes.
//
// Session token format: `${expiresAtMs}.${hexHmacSignature}`
// Signed with HMAC-SHA256 over SITE_PASSCODE using Web Crypto (edge-safe,
// works in both middleware and route handlers).

export const SESSION_COOKIE_NAME = "hta_inv_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  const secret = process.env.SITE_PASSCODE;
  if (!secret) {
    throw new Error("Missing SITE_PASSCODE env var");
  }
  return secret;
}

async function hmac(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSessionToken(): Promise<string> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const signature = await hmac(String(expiresAt), getSecret());
  return `${expiresAt}.${signature}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [expiresAtStr, signature] = token.split(".");
  if (!expiresAtStr || !signature) return false;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expectedSignature = await hmac(expiresAtStr, getSecret());
  return timingSafeEqual(signature, expectedSignature);
}

export function verifyPasscode(input: string): boolean {
  return timingSafeEqual(input, getSecret());
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;
