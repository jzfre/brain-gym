import { describe, expect, it } from "vitest";
import { draftKey, newDraft, parseDraft } from "@/components/today/draft-storage";

const problemId = "00000000-0000-4000-8000-000000000001";
const submissionId = "00000000-0000-4000-8000-000000000002";

describe("exercise drafts", () => {
  it("restores all answer modes, current step, start time, and the original submission identity", () => {
    const draft = {
      ...newDraft(problemId, submissionId),
      startedAt: Date.now() - 60_000,
      step: 2,
      text: "Incident analysis",
      memoAnswers: ["Claim", "Evidence"],
      sectionAnswers: { "1": "Choice A" },
      lsatAnswers: { "1": { choice: "A", reasoning: "All red boxes are heavy." } }
    };
    expect(parseDraft(JSON.stringify(draft), problemId)).toEqual(draft);
    expect(draftKey(problemId)).toContain(problemId);
  });

  it.each([
    null,
    "{",
    "null",
    "[]",
    '{"version":99}',
    JSON.stringify({
      ...newDraft(problemId, submissionId),
      lsatAnswers: { "1": null }
    })
  ])("ignores malformed or incompatible stored drafts (%s)", (raw) => {
    expect(parseDraft(raw, problemId)).toBeNull();
  });

  it("never restores another problem's draft", () => {
    expect(parseDraft(JSON.stringify(newDraft(problemId, submissionId)), submissionId)).toBeNull();
  });

  it("rejects invalid timer values and corrupted submission IDs", () => {
    for (const patch of [
      { startedAt: Date.now() + 60_000 },
      { startedAt: -1 },
      { step: -1 },
      { clientSubmissionId: "invalid" },
      { memoAnswers: [1] }
    ]) {
      expect(
        parseDraft(JSON.stringify({ ...newDraft(problemId, submissionId), ...patch }), problemId)
      ).toBeNull();
    }
  });
});
