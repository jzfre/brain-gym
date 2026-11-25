import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { issueSessionToken, SESSION_COOKIE } from "@/lib/auth";

describe("authentication middleware", () => {
  it("returns JSON 401 for an unauthenticated API request", async () => {
    const response = await middleware(new NextRequest("https://example.test/api/history"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });
  it("preserves path and query in the login redirect", async () => {
    const response = await middleware(new NextRequest("https://example.test/today?problem=123"));
    const redirect = new URL(response.headers.get("location")!);
    expect(redirect.pathname).toBe("/login");
    expect(redirect.searchParams.get("next")).toBe("/today?problem=123");
  });
  it("accepts valid sessions and overwrites the client-supplied path header", async () => {
    const token = await issueSessionToken(process.env.SESSION_SECRET!);
    const response = await middleware(new NextRequest("https://example.test/history", {
      headers: { cookie: `${SESSION_COOKIE}=${token}`, "x-pathname": "/login" }
    }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-request-x-pathname")).toBe("/history");
  });
  it("allows only the exact readiness path without authentication", async () => {
    expect((await middleware(new NextRequest("https://example.test/api/health"))).status).toBe(200);
    expect((await middleware(new NextRequest("https://example.test/api/health/private"))).status).toBe(401);
  });
});
