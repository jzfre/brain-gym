import { describe, it, expect, vi, beforeEach } from "vitest";
import { AttemptStatus } from "@prisma/client";

// Fully mocked: tests/setup.ts loads the live .env, so nothing here may reach
// the real database or OpenAI.
const findUnique = vi.fn();
const update = vi.fn(async (..._args: unknown[]) => ({}));
vi.mock("@/lib/db/client", () => ({
  prisma: { attempt: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) } }
}));
vi.mock("@/lib/exercises/registry", () => ({ getMode: vi.fn() }));
vi.mock("@/lib/prompts/registry", () => ({ loadActivePrompt: vi.fn() }));

import { POST } from "@/app/api/attempts/[id]/evaluate/route";
import { clearInFlight, isInFlight } from "@/lib/evaluation/in-flight";

function call(id: number) {
  return POST(new Request(`http://x/api/attempts/${id}/evaluate`, { method: "POST" }), {
    params: Promise.resolve({ id: String(id) })
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearInFlight(7);
});

describe("POST /api/attempts/:id/evaluate", () => {
  it("resets a failed attempt to SUBMITTED before re-running, so polls don't see the old failure", async () => {
    findUnique
      .mockResolvedValueOnce({ id: 7, status: AttemptStatus.EVAL_FAILED, evaluation: null })
      // runEvaluation's own lookup: pretend it already finished so it exits early
      .mockResolvedValueOnce({ id: 7, evaluation: { id: 1 } });

    const res = await call(7);

    expect(res.status).toBe(202);
    expect(update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { status: AttemptStatus.SUBMITTED }
    });
  });

  it("marks the attempt in flight until the run settles", async () => {
    let finish!: (v: unknown) => void;
    findUnique
      .mockResolvedValueOnce({ id: 7, status: AttemptStatus.SUBMITTED, evaluation: null })
      .mockReturnValueOnce(new Promise((r) => (finish = r)));

    await call(7);
    expect(isInFlight(7)).toBe(true);
    expect(update).not.toHaveBeenCalled(); // SUBMITTED needs no reset

    finish({ id: 7, evaluation: { id: 1 } });
    await vi.waitFor(() => expect(isInFlight(7)).toBe(false));
  });

  it("does not start a second run while one is in flight", async () => {
    findUnique.mockResolvedValue({ id: 7, status: AttemptStatus.SUBMITTED, evaluation: null });
    const { markInFlight } = await import("@/lib/evaluation/in-flight");
    markInFlight(7);

    const res = await call(7);

    expect(res.status).toBe(202);
    expect(findUnique).toHaveBeenCalledTimes(1); // no runEvaluation lookup
  });
});
