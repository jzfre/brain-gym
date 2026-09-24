import { describe, it, expect, vi, beforeEach } from "vitest";
import { AttemptStatus } from "@prisma/client";

// Fully mocked: tests/setup.ts loads the live .env, so nothing here may reach
// the real database or OpenAI.
const findUnique = vi.fn();
const updateMany = vi.fn(async (..._args: unknown[]) => ({ count: 0 }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    attempt: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      updateMany: (...a: unknown[]) => updateMany(...a)
    }
  }
}));
vi.mock("@/lib/exercises/registry", () => ({ getMode: vi.fn() }));
vi.mock("@/lib/prompts/registry", () => ({ loadActivePrompt: vi.fn() }));

import { POST } from "@/app/api/attempts/[id]/evaluate/route";
import { clearInFlight, isInFlight, markInFlight } from "@/lib/evaluation/in-flight";

// The route's status-guarded reset of a stale EVAL_FAILED.
const resetFailed = {
  where: { id: 7, status: AttemptStatus.EVAL_FAILED },
  data: { status: AttemptStatus.SUBMITTED }
};

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
    expect(updateMany).toHaveBeenCalledWith(resetFailed);
  });

  it("resets an EVAL_FAILED written by a run that finished after this request's read", async () => {
    let dbStatus: AttemptStatus = AttemptStatus.SUBMITTED;
    updateMany.mockImplementation(async (...args: unknown[]) => {
      const { where, data } = args[0] as typeof resetFailed;
      if (where.status !== dbStatus) return { count: 0 };
      dbStatus = data.status;
      return { count: 1 };
    });
    markInFlight(7); // previous run still going
    findUnique
      .mockImplementationOnce(async () => {
        const snapshot = { id: 7, status: dbStatus, evaluation: null }; // read: SUBMITTED
        dbStatus = AttemptStatus.EVAL_FAILED; // the old run fails...
        clearInFlight(7); // ...and leaves the set before this POST resumes
        return snapshot;
      })
      .mockResolvedValueOnce({ id: 7, evaluation: { id: 1 } }); // new run's lookup exits

    expect((await call(7)).status).toBe(202);
    expect(dbStatus).toBe(AttemptStatus.SUBMITTED);
  });

  it("marks the attempt in flight until the run settles", async () => {
    let finish!: (v: unknown) => void;
    findUnique
      .mockResolvedValueOnce({ id: 7, status: AttemptStatus.SUBMITTED, evaluation: null })
      .mockReturnValueOnce(new Promise((r) => (finish = r)));

    await call(7);
    expect(isInFlight(7)).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(resetFailed); // status-guarded: a no-op for SUBMITTED

    finish({ id: 7, evaluation: { id: 1 } });
    await vi.waitFor(() => expect(isInFlight(7)).toBe(false));
  });

  it("does not start a second run while one is in flight", async () => {
    findUnique.mockResolvedValue({ id: 7, status: AttemptStatus.SUBMITTED, evaluation: null });
    markInFlight(7);

    const res = await call(7);

    expect(res.status).toBe(202);
    expect(findUnique).toHaveBeenCalledTimes(1); // no runEvaluation lookup
  });
});
