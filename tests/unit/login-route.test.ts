import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/login/route";
import { SESSION_COOKIE, SESSION_MAX_AGE_SEC, verifySessionToken } from "@/lib/auth";

const state = globalThis as typeof globalThis & { loginFailures?: unknown };
const login = (password: unknown) => POST(new Request("http://localhost/api/auth/login", {
  method: "POST", body: JSON.stringify({ password })
}));

beforeEach(() => {
  delete state.loginFailures;
  vi.useRealTimers();
});

describe("login", () => {
  it("issues a valid HttpOnly session only for the correct password", async () => {
    const response = await login("test-password");
    expect(response.status).toBe(200);
    const token = response.cookies.get(SESSION_COOKIE)?.value;
    expect(token).toBeTruthy();
    expect(await verifySessionToken(token!, process.env.SESSION_SECRET!, SESSION_MAX_AGE_SEC)).toBe(true);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  });

  it.each([null, "", 42, "x".repeat(1025)])("rejects invalid input", async (password) => {
    expect((await login(password)).status).toBe(400);
  });

  it("limits repeated failures and permits retry after the window", async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 10; i++) {
      const response = await login("wrong");
      expect(response.status).toBe(401);
      expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
    }
    const blocked = await login("test-password");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("60");
    vi.advanceTimersByTime(60_000);
    expect((await login("test-password")).status).toBe(200);
    vi.useRealTimers();
  });
});
