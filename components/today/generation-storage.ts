export const PENDING_GENERATION_KEY = "brain-gym:generation:v1";
const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUGS = ["MEMO_EXTRACTION", "INCIDENT_RESPONSE", "LSAT_LOGICAL_REASONING"] as const;
const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type GenerationRequest = {
  clientGenerationId: string;
  exerciseSlug: (typeof SLUGS)[number];
  difficulty: (typeof DIFFICULTIES)[number];
};
export type PendingGeneration =
  | { version: 1; jobId: string }
  | ({ version: 1; jobId?: string } & GenerationRequest);

export function validGenerationId(value: unknown): value is string {
  return typeof value === "string" && JOB_ID.test(value);
}

export function parsePendingGeneration(data: unknown): PendingGeneration | null {
  if (!data || typeof data !== "object" || !("version" in data) || data.version !== 1) return null;
  const record = data as Record<string, unknown>;
  if (
    validGenerationId(record.clientGenerationId) &&
    SLUGS.includes(record.exerciseSlug as GenerationRequest["exerciseSlug"]) &&
    DIFFICULTIES.includes(record.difficulty as GenerationRequest["difficulty"])
  ) {
    return {
      version: 1,
      clientGenerationId: record.clientGenerationId,
      exerciseSlug: record.exerciseSlug as GenerationRequest["exerciseSlug"],
      difficulty: record.difficulty as GenerationRequest["difficulty"],
      ...(validGenerationId(record.jobId) ? { jobId: record.jobId } : {})
    };
  }
  return validGenerationId(record.jobId) ? { version: 1, jobId: record.jobId } : null;
}

export function readPendingGeneration(storage: Pick<Storage, "getItem">): PendingGeneration | null {
  try {
    return parsePendingGeneration(JSON.parse(storage.getItem(PENDING_GENERATION_KEY) ?? "null"));
  } catch {
    return null;
  }
}

export function writePendingGeneration(
  storage: Pick<Storage, "setItem">,
  pending: PendingGeneration
): void {
  try {
    storage.setItem(PENDING_GENERATION_KEY, JSON.stringify(pending));
  } catch {
    // The URL also carries the request/job, so reload/sign-in still works.
  }
}

export function clearPendingGeneration(
  storage: Pick<Storage, "getItem" | "removeItem">,
  id: string
): void {
  try {
    const pending = readPendingGeneration(storage);
    if (
      pending?.jobId === id ||
      (pending && "clientGenerationId" in pending && pending.clientGenerationId === id)
    ) {
      storage.removeItem(PENDING_GENERATION_KEY);
    }
  } catch {
    /* Storage restrictions must not prevent using a completed exercise. */
  }
}

export function generationRecoveryPath(pending: PendingGeneration): string {
  if (pending.jobId) return `/today?jobId=${encodeURIComponent(pending.jobId)}`;
  if ("clientGenerationId" in pending) {
    const query = new URLSearchParams({
      generationId: pending.clientGenerationId,
      exerciseSlug: pending.exerciseSlug,
      difficulty: pending.difficulty
    });
    return `/today?${query}`;
  }
  return "/today";
}
