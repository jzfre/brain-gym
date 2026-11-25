import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { attempt: { findMany: db.findMany } } }));
vi.mock("@/lib/config", () => ({ getConfig: () => ({ localUserId: "local-user" }) }));
import { GET } from "@/app/api/history/route";

beforeEach(() => {
  vi.resetAllMocks();
  db.findMany.mockResolvedValue([]);
});

describe("GET /api/history", () => {
  it("defaults to a bounded page with a stable sort", async () => {
    expect((await GET(new Request("http://x/api/history"))).status).toBe(200);
    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "local-user" },
        take: 30,
        skip: 0,
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }]
      })
    );
  });

  it("accepts valid pagination", async () => {
    expect((await GET(new Request("http://x/api/history?limit=100&offset=30"))).status).toBe(200);
    expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100, skip: 30 }));
  });

  it.each([
    "limit=abc",
    "limit=-1",
    "limit=0",
    "limit=1.5",
    "limit=Infinity",
    "limit=101",
    "limit=",
    "offset=-1",
    "offset=NaN",
    "offset=0.5",
    "offset=2147483648"
  ])("rejects invalid pagination %s before querying", async (query) => {
    const response = await GET(new Request(`http://x/api/history?${query}`));
    expect(response.status).toBe(400);
    expect(db.findMany).not.toHaveBeenCalled();
  });
});
