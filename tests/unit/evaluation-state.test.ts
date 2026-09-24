import { describe, it, expect } from "vitest";
import { evaluationState } from "@/lib/evaluation/state";

describe("evaluationState", () => {
  it("is evaluated once an evaluation row exists", () => {
    expect(
      evaluationState({ attempt: { status: "EVALUATED" }, evaluation: {}, evaluating: false })
    ).toBe("evaluated");
  });

  it("is failed when the attempt is marked EVAL_FAILED", () => {
    expect(
      evaluationState({ attempt: { status: "EVAL_FAILED" }, evaluation: null, evaluating: false })
    ).toBe("failed");
  });

  it("is interrupted when nothing is evaluating an unevaluated attempt", () => {
    // e.g. the container restarted mid-evaluation and took the run with it
    expect(
      evaluationState({ attempt: { status: "SUBMITTED" }, evaluation: null, evaluating: false })
    ).toBe("interrupted");
  });

  it("is evaluating while a run is in flight", () => {
    expect(
      evaluationState({ attempt: { status: "SUBMITTED" }, evaluation: null, evaluating: true })
    ).toBe("evaluating");
  });

  it("does not claim interrupted when the server did not report in-flight state", () => {
    expect(evaluationState({ attempt: { status: "SUBMITTED" }, evaluation: null })).toBe(
      "evaluating"
    );
  });
});
