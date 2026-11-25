const POLL_INTERVAL_MS = 3000;
const POLL_DEADLINE_MS = 45 * 60 * 1000;

export class GenerationStopped extends Error {
  constructor(message: string, public readonly kind: "auth" | "missing" | "failed") {
    super(message);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

// Cancel client polling on navigation. The server job continues independently.
export async function pollForProblem(jobId: string, signal: AbortSignal): Promise<string> {
  const deadline = Date.now() + POLL_DEADLINE_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS, signal);
    try {
      const response = await fetch(`/api/problems/generate/${encodeURIComponent(jobId)}`, {
        signal,
        cache: "no-store"
      });
      if (response.status === 401 || response.status === 403) {
        throw new GenerationStopped("Your session expired. Sign in again to continue.", "auth");
      }
      if (response.status === 404) {
        throw new GenerationStopped("This generation could not be found. Please generate a new exercise.", "missing");
      }
      if (!response.ok) continue;
      const data = await response.json();
      if (data.status === "succeeded" && typeof data.problemId === "string") return data.problemId;
      if (data.status === "failed") {
        throw new GenerationStopped(data.error ?? "Generation failed. Please retry.", "failed");
      }
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof GenerationStopped) throw error;
      // Network and proxy failures are transient; keep polling the existing job.
    }
  }
  throw new Error(
    "Still generating after 45 minutes — the server keeps working and a finished problem " +
      "will appear under Admin → Problems. Use Check generation to resume checking this job."
  );
}

export async function saveAttemptAndEvaluate(input: {
  problemId: string;
  clientSubmissionId?: string;
  responseText: string;
  timeSpentSeconds: number;
}): Promise<number> {
  const response = await fetch("/api/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Your session expired. Sign in again to submit this answer.");
    }
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Failed to save attempt (${response.status}). Please retry.`);
  }
  const { attemptId } = await response.json();
  if (!Number.isSafeInteger(attemptId) || attemptId <= 0) {
    throw new Error("The server returned an invalid attempt. Check History before retrying.");
  }
  // Once saved, always hand off to feedback. A failed kickoff must never return
  // the user to Submit and create a second attempt. Feedback can retry this ID.
  await startEvaluation(attemptId).catch(() => {});
  return attemptId;
}

export async function startEvaluation(attemptId: number): Promise<void> {
  const response = await fetch(`/api/attempts/${attemptId}/evaluate`, { method: "POST" });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Your session expired. Reload this page to sign in again.");
    }
    throw new Error(`Couldn’t start evaluation (${response.status}). Please try again.`);
  }
}
