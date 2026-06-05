import { describe, it, expect } from "vitest";
import { MemoGeneratedProblemSchema, MemoEvaluationSchema } from "@/lib/exercises/memo-extraction/schemas";

const validProblem = {
  title: "City budget memo",
  difficulty: "MEDIUM",
  timeboxMinutes: 35,
  suggestedPacing: [
    { label: "read", minutes: 10 },
    { label: "answer", minutes: 20 },
    { label: "review", minutes: 5 }
  ],
  userVisiblePrompt: "Read the following long-enough article text for the memo extraction exercise.",
  requiredAnswerSections: [
    { order: 1, title: "Claim", description: null },
    { order: 2, title: "Evidence", description: null },
    { order: 3, title: "Assumptions", description: null },
    { order: 4, title: "Tradeoffs", description: null },
    { order: 5, title: "Next test", description: null },
    { order: 6, title: "What would change my mind", description: null }
  ],
  hiddenAnswerKey: {
    idealClaim: "x",
    mustCiteEvidence: ["a", "b", "c"],
    keyAssumptions: ["a1", "a2", "a3"],
    strongestTradeoffs: ["t1", "t2"],
    sharpestNextTest: "test",
    mindChanger: "this would change it"
  },
  rubric: {
    dimensions: [
      { name: "Claim clarity", maxScore: 10, description: "" },
      { name: "Evidence quality", maxScore: 10, description: "" },
      { name: "Assumptions", maxScore: 10, description: "" },
      { name: "Tradeoffs", maxScore: 10, description: "" },
      { name: "Testability", maxScore: 10, description: "" },
      { name: "What would change my mind", maxScore: 10, description: "" }
    ]
  },
  tags: ["budget", "municipal"],
  sourceCitations: [],
  duplicateAvoidanceKey: "city-budget-memo"
};

describe("MemoGeneratedProblemSchema", () => {
  it("accepts a valid problem", () => {
    expect(MemoGeneratedProblemSchema.parse(validProblem)).toBeTruthy();
  });

  it("rejects fewer than 6 required answer sections", () => {
    const bad = { ...validProblem, requiredAnswerSections: validProblem.requiredAnswerSections.slice(0, 3) };
    expect(() => MemoGeneratedProblemSchema.parse(bad)).toThrow();
  });

  it("rejects a rubric without the What would change my mind dimension", () => {
    const bad = { ...validProblem, rubric: { dimensions: validProblem.rubric.dimensions.slice(0, 5) } };
    expect(() => MemoGeneratedProblemSchema.parse(bad)).toThrow();
  });
});

const dimensionNames = [
  "Claim clarity",
  "Evidence quality",
  "Assumptions",
  "Tradeoffs",
  "Testability",
  "What would change my mind"
];

function makeEvaluation(names: string[]) {
  return {
    overallScore: 7.5,
    shortDiagnosis: "Evidence is anecdotal.",
    dimensions: names.map((n) => ({
      name: n,
      score: 7,
      rationale: "ok",
      exampleResponse: "A concrete strong answer for this dimension.",
      sharperVersion: null,
      missingItems: null
    })),
    summary: "Decent attempt overall.",
    topFixes: ["a", "b", "c"],
    rewriteSuggestions: {
      improvedClaim: "x",
      missingAssumptions: ["a1", "a2"],
      missingTradeoffs: ["t1", "t2"],
      betterPhrasingForWeakEvidence: ["e1"]
    },
    strongAnswerSketch: "...",
    nextRep: "Practice prephrasing",
    clarificationQuestion: null,
    errorPatternTags: ["vague-claim"],
    missClassifications: []
  };
}

describe("MemoEvaluationSchema", () => {
  it("accepts a valid 6-dimension evaluation", () => {
    expect(MemoEvaluationSchema.parse(makeEvaluation(dimensionNames))).toBeTruthy();
  });

  it("accepts a 5-dimension evaluation (problems generated before the mind-change dimension)", () => {
    expect(MemoEvaluationSchema.parse(makeEvaluation(dimensionNames.slice(0, 5)))).toBeTruthy();
  });

  it("rejects a dimension without an example response", () => {
    const ev = makeEvaluation(dimensionNames);
    const { exampleResponse: _drop, ...rest } = ev.dimensions[0];
    ev.dimensions[0] = rest as (typeof ev.dimensions)[number];
    expect(() => MemoEvaluationSchema.parse(ev)).toThrow();
  });
});
