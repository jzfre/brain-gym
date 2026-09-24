// What the feedback panel should show for an attempt, from GET /api/history/:id.
export type EvaluationState = "evaluated" | "failed" | "interrupted" | "evaluating" | "unavailable";

export type EvaluationStatusDetail = {
  attempt?: { status: string };
  evaluation?: unknown;
  // Whether this server process is running the evaluation right now.
  evaluating?: boolean;
  error?: string;
};

export function evaluationState(d: EvaluationStatusDetail): EvaluationState {
  // An error body (middleware's 401 once the session lapses, the route's
  // 404/400), not attempt state — never poll it as "evaluating".
  if (!d.attempt) return "unavailable";
  if (d.evaluation) return "evaluated";
  // A running evaluation beats a stale EVAL_FAILED: a retry is marked in flight
  // before its reset to SUBMITTED commits, so a poll can see both at once.
  if (d.evaluating === true) return "evaluating";
  if (d.attempt.status === "EVAL_FAILED") return "failed";
  // Not evaluated, not failed, and nothing running it: the run died with the
  // process (e.g. a container restart). Only trust an explicit `false`.
  if (d.evaluating === false) return "interrupted";
  return "evaluating";
}
