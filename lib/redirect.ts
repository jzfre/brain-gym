// Validates an attacker-controllable post-login `next` target down to a
// same-origin relative path. A prefix check like `startsWith("/") &&
// !startsWith("//")` is not enough: browsers normalize backslashes to forward
// slashes, so "/\evil.com" becomes protocol-relative and redirects off-site.
// We reject backslashes/control chars outright and require the resolved URL to
// share the app's origin.
export function safeNextPath(raw: string | null | undefined, origin: string): string {
  const fallback = "/today";
  if (!raw) return fallback;
  // Backslashes and control chars are the classic bypass vectors; reject them
  // before parsing so a normalized "/\host" can never slip through.
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c === 0x5c /* \ */ || c <= 0x1f || c === 0x7f) return fallback;
  }
  try {
    const u = new URL(raw, origin);
    if (u.origin !== origin) return fallback;
    const path = u.pathname + u.search + u.hash;
    return path.startsWith("/") ? path : fallback;
  } catch {
    return fallback;
  }
}
