import { randomUUID } from "node:crypto";

export type GenerationJobStatus = "pending" | "succeeded" | "failed";

export type GenerationJob = {
  status: GenerationJobStatus;
  problemId?: string;
  error?: string;
  createdAt: number;
};

// Jobs live in process memory, like the evaluate route's in-flight guard: the
// production container is a single long-lived Node process, so a job created
// by POST is visible to the polling GET. A container restart loses the map,
// but it also kills the in-flight generation itself — the client treats an
// unknown job id as "retry".
// Settled jobs are kept briefly for late polls; pending jobs get a much longer
// leash because a generation can legitimately run for the OpenAI timeout times
// the SDK's internal retries — pruning a pending job mid-run would make the
// client report a bogus "server restarted" and orphan the eventual result.
const SETTLED_MAX_AGE_MS = 30 * 60 * 1000;
const PENDING_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const jobs = new Map<string, GenerationJob>();

function prune(now: number): void {
  for (const [id, job] of jobs) {
    const maxAge = job.status === "pending" ? PENDING_MAX_AGE_MS : SETTLED_MAX_AGE_MS;
    if (now - job.createdAt > maxAge) jobs.delete(id);
  }
}

export function createJob(now: number = Date.now()): string {
  prune(now);
  const id = randomUUID();
  jobs.set(id, { status: "pending", createdAt: now });
  return id;
}

export function getJob(id: string): GenerationJob | undefined {
  return jobs.get(id);
}

export function completeJob(id: string, problemId: string): void {
  const job = jobs.get(id);
  if (job) jobs.set(id, { ...job, status: "succeeded", problemId });
}

export function failJob(id: string, error: string): void {
  const job = jobs.get(id);
  if (job) jobs.set(id, { ...job, status: "failed", error });
}

/** Test-only: empty the store so cases don't leak into each other. */
export function clearJobs(): void {
  jobs.clear();
}
