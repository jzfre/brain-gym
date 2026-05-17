import { describe, it, expect } from "vitest";
import { IncidentGeneratedProblemSchema, IncidentEvaluationSchema } from "@/lib/exercises/incident-response/schemas";

const eleven = <T>(mk: (i: number) => T): T[] => Array.from({ length: 11 }, (_, i) => mk(i));

const baseProblem = {
  title: "Queue backpressure",
  difficulty: "HARD",
  timeboxMinutes: 45,
  suggestedPacing: [
    { label: "read", minutes: 7 },
    { label: "answer", minutes: 25 },
    { label: "numerical sanity check", minutes: 8 },
    { label: "revise", minutes: 5 }
  ],
  userVisiblePrompt:
    "Long incident scenario text padded so it definitely passes the 200 character minimum length check. " +
    "We describe context, system flow, supporting systems, normal behavior, current incident, metrics, recent changes, more observations, numerical sanity check, and the user's task with all 11 answer sections.",
  requiredAnswerSections: eleven((i) => ({ order: i + 1, title: `Section ${i + 1}`, description: null })),
  hiddenAnswerKey: {
    primaryRootCause: "x",
    containmentSteps: ["a", "b"],
    rejectedDangerousIdeas: ["c"],
    expectedNumericRanges: [{ metric: "qps", range: "100-200" }]
  },
  rubric: {
    dimensions: eleven((i) => ({ name: `Dim${i}`, maxScore: 10, description: "" }))
  },
  tags: ["queue", "vendor"],
  sourceCitations: [],
  duplicateAvoidanceKey: "queue-backpressure"
};

describe("IncidentGeneratedProblemSchema", () => {
  it("accepts a valid scenario", () => {
    expect(IncidentGeneratedProblemSchema.parse(baseProblem)).toBeTruthy();
  });

  it("requires exactly 11 sections", () => {
    expect(() =>
      IncidentGeneratedProblemSchema.parse({ ...baseProblem, requiredAnswerSections: [] })
    ).toThrow();
  });
});

describe("IncidentEvaluationSchema", () => {
  it("accepts a valid evaluation", () => {
    const ev = {
      overallScore: 6.5,
      shortDiagnosis: "Containment too soft.",
      dimensions: eleven((i) => ({ name: `Dim${i}`, score: 6, rationale: "ok", sharperVersion: null, missingItems: null })),
      summary: "Solid analysis but soft containment.",
      topFixes: ["a", "b", "c"],
      rewriteSuggestions: { betterContainment: ["x"], betterCustomerPrioritization: "y", betterNumericalSanityCheck: "z" },
      strongAnswerSketch: "...",
      nextRep: "Practice containment ladders",
      clarificationQuestion: null,
      errorPatternTags: ["soft-containment"],
      missClassifications: []
    };
    expect(IncidentEvaluationSchema.parse(ev)).toBeTruthy();
  });
});
