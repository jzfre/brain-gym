import { beforeEach, describe, expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: { $queryRaw: query } }));
import { GET } from "@/app/api/health/route";

describe("readiness", () => {
  beforeEach(() => { query.mockReset(); });
  it("checks database connectivity and prevents caching", async () => {
    query.mockResolvedValue([{ "?column?": 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(query).toHaveBeenCalledOnce();
  });
  it("returns 503 without leaking connection details", async () => {
    query.mockRejectedValue(new Error("postgresql://private:password@db"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});
