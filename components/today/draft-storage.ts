import { z } from "zod";

const DraftSchema = z.object({
  version: z.literal(1),
  problemId: z.string().uuid(),
  clientSubmissionId: z.string().uuid(),
  startedAt: z.number().finite().nonnegative().nullable(),
  step: z.number().int().nonnegative(),
  text: z.string(),
  sectionAnswers: z.record(z.string(), z.string()),
  memoAnswers: z.array(z.string()),
  lsatAnswers: z.record(z.string(), z.object({ choice: z.string(), reasoning: z.string() }))
});

export type ExerciseDraft = z.infer<typeof DraftSchema>;
export type DraftUpdate = (update: Partial<ExerciseDraft>) => void;
export const draftKey = (problemId: string) => `brain-gym:draft:v1:${problemId}`;

export function newDraft(problemId: string, clientSubmissionId: string): ExerciseDraft {
  return {
    version: 1,
    problemId,
    clientSubmissionId,
    startedAt: null,
    step: 0,
    text: "",
    sectionAnswers: {},
    memoAnswers: [],
    lsatAnswers: {}
  };
}

// Reject stale/malformed local data without crashing or trusting a different
// problem's draft. Storage access itself is caught by the hook (private mode,
// browser policy, full quota) so an unavailable disk never disables editing.
export function parseDraft(raw: string | null, problemId: string): ExerciseDraft | null {
  if (!raw) return null;
  try {
    const parsed = DraftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.problemId !== problemId) return null;
    if (parsed.data.startedAt !== null && parsed.data.startedAt > Date.now()) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
