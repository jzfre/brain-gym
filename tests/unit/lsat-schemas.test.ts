import { describe, it, expect } from "vitest";
import { LsatGeneratedProblemSchema, LsatEvaluationSchema } from "@/lib/exercises/lsat-logical-reasoning/schemas";

function question(number: number) {
  return {
    number,
    stimulus:
      "A city replaced its bus fleet and ridership rose the following quarter, so officials concluded the new buses caused the increase.",
    questionStem: "Which one of the following is an assumption required by the argument?",
    choices: { A: "alpha", B: "beta", C: "gamma", D: "delta", E: "epsilon" },
    questionType: "Necessary assumption",
    correctChoice: "C",
    explanation: "The argument depends on ruling out other causes of the ridership increase.",
    distractorAnalyses: { A: "too strong", B: "irrelevant", C: "correct", D: "reversed", E: "out of scope" }
  };
}

const validProblem = {
  title: "Logical reasoning set — assumptions & flaws",
  difficulty: "MEDIUM",
  timeboxMinutes: 45,
  suggestedPacing: [
    { label: "read stimulus", minutes: 2 },
    { label: "prephrase", minutes: 1 },
    { label: "eliminate", minutes: 2 }
  ],
  questions: [question(1), question(2), question(3)],
  rubric: {
    dimensions: [
      { name: "Correctness", maxScore: 10, description: "" },
      { name: "Reasoning quality", maxScore: 5, description: "" }
    ]
  },
  tags: ["necessary-assumption", "flaw"],
  sourceCitations: [],
  duplicateAvoidanceKey: "set-assumptions-flaws"
};

describe("LsatGeneratedProblemSchema", () => {
  it("accepts a valid LSAT set", () => {
    expect(LsatGeneratedProblemSchema.parse(validProblem)).toBeTruthy();
  });

  it("rejects a question with an invalid correctChoice", () => {
    const bad = JSON.parse(JSON.stringify(validProblem));
    bad.questions[0].correctChoice = "F";
    expect(() => LsatGeneratedProblemSchema.parse(bad)).toThrow();
  });

  it("rejects a set with too few questions", () => {
    const bad = JSON.parse(JSON.stringify(validProblem));
    bad.questions = [question(1)];
    expect(() => LsatGeneratedProblemSchema.parse(bad)).toThrow();
  });
});

describe("LsatEvaluationSchema", () => {
  it("accepts a valid set evaluation", () => {
    const ev = {
      shortDiagnosis: "Solid on flaws, shaky on necessary-assumption scope.",
      summary: "You correctly identified causal flaws but over-selected too-strong assumptions in NA questions.",
      topFixes: ["Negate the assumption to test necessity", "Watch modal scope"],
      nextRep: "5 necessary-assumption reps with the negation test",
      errorPatternTags: ["too-strong", "modal-trap"],
      questions: [
        { number: 1, explanation: "Right because it rules out alternatives.", reasoningCritique: "Good causal read.", missClassification: null },
        { number: 2, explanation: "The flaw is a part-whole error.", reasoningCritique: "Missed the scope shift.", missClassification: "too_strong" }
      ]
    };
    expect(LsatEvaluationSchema.parse(ev)).toBeTruthy();
  });

  it("rejects an invalid missClassification", () => {
    const bad = {
      shortDiagnosis: "ok ok",
      summary: "summary long enough",
      topFixes: ["fix"],
      nextRep: "rep",
      errorPatternTags: [],
      questions: [{ number: 1, explanation: "explain", reasoningCritique: "crit", missClassification: "nope" }]
    };
    expect(() => LsatEvaluationSchema.parse(bad)).toThrow();
  });
});
