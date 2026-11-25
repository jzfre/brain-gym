// The app has one shared password and one Node process. A global failure budget
// bounds brute-force attempts without trusting spoofable forwarded IP headers.
// For multiple replicas, enforce a shared limit at the reverse proxy instead.
const WINDOW_MS = 60_000;
const MAX_FAILURES = 10;
const state = globalThis as typeof globalThis & {
  loginFailures?: { count: number; resetAt: number };
};

export function loginRetryAfter(now = Date.now()): number {
  const entry = state.loginFailures;
  if (!entry || entry.resetAt <= now || entry.count < MAX_FAILURES) return 0;
  return Math.ceil((entry.resetAt - now) / 1000);
}

export function recordLoginFailure(now = Date.now()): void {
  if (!state.loginFailures || state.loginFailures.resetAt <= now) {
    state.loginFailures = { count: 0, resetAt: now + WINDOW_MS };
  }
  state.loginFailures.count += 1;
}
