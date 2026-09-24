import { describe, it, expect, vi, beforeEach } from "vitest";

// Fully mocked: tests/setup.ts loads the live .env, so nothing here may reach
// the real database.
const findUnique = vi.fn();
vi.mock("@/lib/db/client", () => ({
  prisma: { attempt: { findUnique: (...a: unknown[]) => findUnique(...a) } }
}));

import { GET } from "@/app/api/history/[attemptId]/route";
import { clearInFlight, markInFlight } from "@/lib/evaluation/in-flight";

const unevaluated = {
  id: 9,
  responseText: "x",
  timeSpentSeconds: 1,
  submittedAt: new Date(0),
  status: "SUBMITTED",
  problem: {},
  evaluation: null
};

async function get(id: number) {
  const res = await GET(new Request(`http://x/api/history/${id}`), {
    params: Promise.resolve({ attemptId: String(id) })
  });
  return (await res.json()) as { evaluating: boolean; attempt: { status: string } };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearInFlight(9);
});

describe("GET /api/history/:attemptId", () => {
  it("reports evaluating while a run is in flight", async () => {
    markInFlight(9);
    findUnique.mockResolvedValueOnce(unevaluated);
    expect((await get(9)).evaluating).toBe(true);
  });

  it("reports not evaluating when nothing is running", async () => {
    findUnique.mockResolvedValueOnce(unevaluated);
    expect((await get(9)).evaluating).toBe(false);
  });

  it("does not pair a pre-finish snapshot with a post-finish flag (no false 'interrupted')", async () => {
    // The run finishes (and leaves the in-flight set) while this poll's read
    // is still in progress, so the read returns the stale unevaluated row.
    markInFlight(9);
    findUnique.mockImplementationOnce(async () => {
      clearInFlight(9);
      return unevaluated;
    });
    expect((await get(9)).evaluating).toBe(true);
  });
});
