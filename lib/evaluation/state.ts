// What the feedback panel should show for an attempt, from GET /api/history/:id.
export type EvaluationState = "evaluated" | "failed" | "interrupted" | "evaluating";

export type EvaluationStatusDetail = {
  attempt?: { status: string };
  evaluation: unknown;
  // Whether this server process is running the evaluation right now.
  evaluating?: boolean;
};

export function evaluationState(d: EvaluationStatusDetail): EvaluationState {
  if (d.evaluation) return "evaluated";
  if (d.attempt?.status === "EVAL_FAILED") return "failed";
  // Not evaluated, not failed, and nothing running it: the run died with the
  // process (e.g. a container restart). Only trust an explicit `false`.
  if (d.evaluating === false) return "interrupted";
  return "evaluating";
}
