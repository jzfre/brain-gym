import { describe, expect, it } from "vitest";
import { shuffleLsatQuestion } from "@/lib/exercises/lsat-logical-reasoning/shuffle";
import type { LsatGeneratedQuestion } from "@/lib/exercises/lsat-logical-reasoning/schemas";

const question: LsatGeneratedQuestion = {
  number: 1,
  stimulus:
    "A city replaced its bus fleet and ridership rose the following quarter, so officials concluded the new buses caused the increase.",
  questionStem: "Which one of the following is an assumption required by the argument?",
  choices: { A: "alpha", B: "beta", C: "gamma", D: "delta", E: "epsilon" },
  questionType: "Necessary assumption",
  correctChoice: "A",
  explanation: "The argument depends on ruling out other causes of the ridership increase.",
  distractorAnalyses: {
    A: "correct analysis",
    B: "beta analysis",
    C: "gamma analysis",
    D: "delta analysis",
    E: "epsilon analysis"
  }
};

describe("shuffleLsatQuestion", () => {
  it("uses Fisher-Yates to move answer text and remap the correct letter", () => {
    // Four zeroes move the original A from the first position to the last.
    const shuffled = shuffleLsatQuestion(question, () => 0);

    expect(shuffled.choices).toEqual({
      A: "beta",
      B: "gamma",
      C: "delta",
      D: "epsilon",
      E: "alpha"
    });
    expect(shuffled.correctChoice).toBe("E");
  });

  it("keeps distractor analyses aligned with their shuffled answer text", () => {
    const shuffled = shuffleLsatQuestion(question, () => 0);

    expect(shuffled.distractorAnalyses).toEqual({
      A: "beta analysis",
      B: "gamma analysis",
      C: "delta analysis",
      D: "epsilon analysis",
      E: "correct analysis"
    });
  });

  it("does not mutate the validated model output", () => {
    const original = structuredClone(question);
    shuffleLsatQuestion(question, () => 0.5);

    expect(question).toEqual(original);
  });
});
