import type { GeneratedProblemCommon, EvaluationCommon } from "@/lib/exercises/types";

export const lsatProblem: GeneratedProblemCommon = {
  title: "Reasoning regression set",
  difficulty: "MEDIUM",
  timeboxMinutes: 15,
  suggestedPacing: [],
  userVisiblePrompt: "Answer the three questions.",
  requiredAnswerSections: [],
  hiddenAnswerKey: {
    answers: [
      { number: 1, correctChoice: "B", explanation: "Bus ridership can increase for reasons other than the new buses." },
      { number: 2, correctChoice: "D", explanation: "A necessary condition is not necessarily sufficient." },
      { number: 3, correctChoice: "A", explanation: "The conclusion confuses the sample with the population." }
    ]
  },
  rubric: { dimensions: [] },
  tags: ["causality", "conditionals", "sampling"],
  sourceCitations: [],
  duplicateAvoidanceKey: "reasoning-regression-set",
  questions: [1, 2, 3].map((number) => ({
    number,
    stimulus: `An argument for question ${number} with premises and a conclusion.`,
    questionStem: "Which answer identifies the flaw?",
    choices: { A: "Sampling", B: "Causality", C: "Scope", D: "Conditional", E: "Relevance" },
    questionType: "Flaw"
  }))
};

export const lsatFeedback = {
  shortDiagnosis: "Review causal and conditional reasoning.",
  summary: "Compare each selected answer against the conclusion and evidence.",
  topFixes: ["State the assumption before reading the choices."],
  nextRep: "Practice necessary and sufficient conditions.",
  errorPatternTags: ["logic"],
  questions: [1, 2, 3].map((number) => ({
    number,
    explanation: `Explanation for question ${number}.`,
    reasoningCritique: "Check the connection between the premises and conclusion.",
    missClassification: "logic" as const
  }))
};

export function rubricProblem(count: number): GeneratedProblemCommon {
  return {
    ...structuredClone(lsatProblem),
    questions: undefined,
    rubric: {
      dimensions: Array.from({ length: count }, (_, i) => ({
        name: `Dimension ${i + 1}`, maxScore: 10, description: "Score from zero to ten."
      }))
    }
  };
}

export function rubricFeedback(count: number): EvaluationCommon {
  return {
    overallScore: 7,
    shortDiagnosis: "A plausible answer with room for improvement.",
    dimensions: rubricProblem(count).rubric.dimensions.map(({ name }) => ({
      name, score: 7, rationale: "Adequate reasoning.", exampleResponse: "A concrete stronger answer.",
      sharperVersion: null, missingItems: null
    })),
    summary: "Check the evidence and make the proposed next step testable.",
    topFixes: ["Use specific evidence", "State assumptions", "Make the next test falsifiable"],
    rewriteSuggestions: {},
    strongAnswerSketch: null,
    nextRep: "Practice evidence selection.",
    clarificationQuestion: null,
    errorPatternTags: [],
    missClassifications: []
  };
}
