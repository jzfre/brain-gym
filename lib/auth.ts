export const SESSION_COOKIE = "bg_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

const encoder = new TextEncoder();

// Constant-time-ish comparison for equal-length hex strings (short-circuits on
// length, which is fine since both operands here are fixed-width hex digests).
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return toHex(digest);
}

// Compares a submitted password against the configured one in constant time.
// Both sides are hashed first so the comparison runs over fixed-length hex (a
// raw compare would leak length); the hash is never stored or sent anywhere.
export async function passwordMatches(submitted: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256Hex(submitted), sha256Hex(expected)]);
  return timingSafeEqualStr(a, b);
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(sig);
}

// Signed, expiring bearer token: "<issuedAtSec>.<hmac(secret, issuedAtSec)>".
// It is NOT derived from the password, so a leaked cookie never reveals
// APP_PASSWORD, and rotating SESSION_SECRET invalidates every outstanding token.
// Edge-runtime-safe: Web Crypto only.
export async function issueSessionToken(
  secret: string,
  nowMs: number = Date.now()
): Promise<string> {
  const issuedAt = Math.floor(nowMs / 1000).toString();
  return `${issuedAt}.${await hmacHex(secret, issuedAt)}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
  maxAgeSec: number,
  nowMs: number = Date.now()
): Promise<boolean> {
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const issuedAt = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(issuedAt)) return false;
  const expected = await hmacHex(secret, issuedAt);
  if (!timingSafeEqualStr(sig, expected)) return false;
  const ageSec = Math.floor(nowMs / 1000) - Number(issuedAt);
  return ageSec <= maxAgeSec;
}
