import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  prisma: { problem: { findUnique: db.findUnique }, attempt: { create: db.create } }
}));
vi.mock("@/lib/config", () => ({ getConfig: () => ({ localUserId: "local-user" }) }));
import { POST } from "@/app/api/attempts/route";

const body = {
  problemId: "00000000-0000-4000-8000-000000000001",
  responseText: "My answer",
  timeSpentSeconds: 120
};
const request = (value: unknown) =>
  POST(
    new Request("http://x/api/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value)
    })
  );

beforeEach(() => {
  vi.resetAllMocks();
  db.findUnique.mockResolvedValue({
    id: body.problemId,
    exerciseType: { slug: "MEMO_EXTRACTION" }
  });
  db.create.mockResolvedValue({ id: 42 });
});

describe("POST /api/attempts", () => {
  it("saves a valid answer for the configured user", async () => {
    const response = await request(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ attemptId: 42 });
    expect(db.create).toHaveBeenCalledWith({ data: { ...body, userId: "local-user" } });
  });

  it.each([
    { responseText: "   \n" },
    { responseText: "x".repeat(50_001) },
    { timeSpentSeconds: -1 },
    { timeSpentSeconds: 1.5 },
    { timeSpentSeconds: 2_147_483_648 },
    { problemId: "invalid" }
  ])("rejects invalid submissions before querying: %j", async (patch) => {
    expect((await request({ ...body, ...patch })).status).toBe(400);
    expect(db.findUnique).not.toHaveBeenCalled();
    expect(db.create).not.toHaveBeenCalled();
  });

  it("returns 404 for a removed or nonexistent problem", async () => {
    db.findUnique.mockResolvedValue(null);
    const response = await request(body);
    expect(response.status).toBe(404);
    expect(db.create).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await POST(new Request("http://x", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expect(db.create).not.toHaveBeenCalled();
  });
});

describe("LSAT submission validation", () => {
  beforeEach(() => {
    db.findUnique.mockResolvedValue({
      id: body.problemId,
      exerciseType: { slug: "LSAT_LOGICAL_REASONING" },
      userVisiblePayload: { questions: [{ number: 1 }, { number: 2 }] }
    });
  });

  it.each([
    "not JSON",
    "null",
    "{}",
    JSON.stringify({ answers: [{ number: 1, choice: "Z" }] }),
    JSON.stringify({ answers: [{ number: 3, choice: "A" }] }),
    JSON.stringify({
      answers: [
        { number: 1, choice: "A" },
        { number: 1, choice: "B" }
      ]
    })
  ])("rejects malformed or mismatched answers before saving: %s", async (responseText) => {
    const response = await request({ ...body, responseText });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_lsat_answer" });
    expect(db.create).not.toHaveBeenCalled();
  });

  it("accepts partial answers and deliberate blanks", async () => {
    const responseText = JSON.stringify({ answers: [{ number: 1, choice: "" }] });
    expect((await request({ ...body, responseText })).status).toBe(200);
    expect(db.create).toHaveBeenCalledOnce();
  });
});
