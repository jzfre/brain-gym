// Valid fixtures for exercising the real SDK/schema/DB/HTTP workflow without
// spending API tokens. These are deterministic test data, not quality claims.
import { memo, incident } from "./live-fixtures";
import { lsatProblem, lsatFeedback, rubricFeedback } from "./fixtures";
import { MEMO_DIMENSIONS, INCIDENT_DIMENSIONS } from "../../lib/exercises/contracts";

const generatedMemo = {
  ...memo,
  suggestedPacing: [
    { label: "Read", minutes: 5 },
    { label: "Answer", minutes: 10 }
  ]
};
const generatedIncident = {
  ...incident,
  suggestedPacing: [
    { label: "Read", minutes: 5 },
    { label: "Analyze", minutes: 5 },
    { label: "Answer", minutes: 5 }
  ]
};
const generatedLsat = {
  ...lsatProblem,
  suggestedPacing: [
    { label: "Read and prephrase", minutes: 2 },
    { label: "Eliminate choices", minutes: 3 }
  ],
  rubric: {
    dimensions: [{ name: "Correctness", maxScore: 10, description: "Select the correct option." }]
  },
  questions: Array.from({ length: 5 }, (_, index) => ({
    ...lsatProblem.questions![index % 3],
    number: index + 1,
    stimulus: `Scenario ${index + 1}: ${lsatProblem.questions![index % 3].stimulus}`,
    correctChoice: "B",
    explanation: "Causal evidence alone does not rule out other explanations.",
    distractorAnalyses: {
      A: "Sampling is not the issue.",
      B: "Causality is the relevant flaw.",
      C: "Scope is unchanged.",
      D: "No conditional is reversed.",
      E: "The evidence is relevant but insufficient."
    }
  }))
};
const memoEvaluation = {
  ...rubricFeedback(6),
  dimensions: rubricFeedback(6).dimensions.map((dimension, index) => ({
    ...dimension,
    name: MEMO_DIMENSIONS[index]
  })),
  rewriteSuggestions: {
    improvedClaim: "Continue the controlled pilot.",
    missingAssumptions: ["Comparable demand", "Stable external conditions"],
    missingTradeoffs: ["Access versus cost", "Evidence versus delay"],
    betterPhrasingForWeakEvidence: ["Suggestive rather than conclusive"]
  }
};
const incidentEvaluation = {
  ...rubricFeedback(11),
  dimensions: rubricFeedback(11).dimensions.map((dimension, index) => ({
    ...dimension,
    name: INCIDENT_DIMENSIONS[index]
  })),
  rewriteSuggestions: {
    betterContainment: ["Bound retries and rate limit."],
    betterCustomerPrioritization: "Protect login alerts first.",
    betterNumericalSanityCheck: "Net drain is throughput minus intake."
  }
};
export const workflowFixtures = {
  MEMO_EXTRACTION: { generated: generatedMemo, evaluation: memoEvaluation },
  INCIDENT_RESPONSE: { generated: generatedIncident, evaluation: incidentEvaluation },
  LSAT_LOGICAL_REASONING: {
    generated: generatedLsat,
    evaluation: {
      ...lsatFeedback,
      questions: Array.from({ length: 5 }, (_, index) => ({
        ...lsatFeedback.questions[index % 3],
        number: index + 1
      }))
    }
  }
};
