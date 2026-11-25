import { describe, expect, it } from "vitest";
import {
  MemoGeneratedProblemSchema,
  MemoEvaluationSchema
} from "@/lib/exercises/memo-extraction/schemas";
import {
  IncidentGeneratedProblemSchema,
  IncidentEvaluationSchema
} from "@/lib/exercises/incident-response/schemas";
import {
  LsatGeneratedProblemSchema,
  LsatEvaluationSchema
} from "@/lib/exercises/lsat-logical-reasoning/schemas";
import { validateRubricEvaluation } from "@/lib/exercises/validate-rubric";
import { workflowFixtures } from "./workflow-fixtures";
import { rubricProblem, rubricFeedback } from "./fixtures";

// These use actual schemas and scoring functions, without mocking model output
// parsing. Adversarial cases reproduce previously accepted unusable exercises.
describe("generated content usability", () => {
  it.each([
    ["MEMO_EXTRACTION", MemoGeneratedProblemSchema, MemoEvaluationSchema],
    ["INCIDENT_RESPONSE", IncidentGeneratedProblemSchema, IncidentEvaluationSchema],
    ["LSAT_LOGICAL_REASONING", LsatGeneratedProblemSchema, LsatEvaluationSchema]
  ] as const)(
    "accepts real workflow fixtures for %s",
    (mode, generatedSchema, evaluationSchema) => {
      expect(generatedSchema.safeParse(workflowFixtures[mode].generated).success).toBe(true);
      expect(evaluationSchema.safeParse(workflowFixtures[mode].evaluation).success).toBe(true);
    }
  );

  it.each([
    "blank key",
    "empty evidence",
    "duplicate headings",
    "duplicate order",
    "duplicate rubric",
    "invented rubric",
    "invalid timebox",
    "whitespace prompt",
    "unsafe source"
  ])("rejects memo with %s", (problemType) => {
    const problem = structuredClone(workflowFixtures.MEMO_EXTRACTION.generated);
    if (problemType === "blank key") problem.hiddenAnswerKey.idealClaim = "   ";
    if (problemType === "empty evidence") problem.hiddenAnswerKey.mustCiteEvidence = [];
    if (problemType === "duplicate headings")
      problem.requiredAnswerSections[1].title = problem.requiredAnswerSections[0].title;
    if (problemType === "duplicate order") problem.requiredAnswerSections[1].order = 1;
    if (problemType === "duplicate rubric")
      problem.rubric.dimensions[1].name = problem.rubric.dimensions[0].name;
    if (problemType === "invented rubric") problem.rubric.dimensions[0].name = "Writing beauty";
    if (problemType === "invalid timebox") problem.timeboxMinutes = 2 ** 31;
    if (problemType === "whitespace prompt") problem.userVisiblePrompt = " ".repeat(100);
    if (problemType === "unsafe source")
      problem.sourceCitations = [{ title: "Source", url: "javascript:alert(1)", publisher: null }];
    expect(MemoGeneratedProblemSchema.safeParse(problem).success).toBe(false);
  });

  it.each(["blank", "duplicate", "duplicate with whitespace"])(
    "rejects %s LSAT choices",
    (kind) => {
      const problem = structuredClone(workflowFixtures.LSAT_LOGICAL_REASONING.generated);
      problem.questions[0].choices.B =
        kind === "blank"
          ? " "
          : kind === "duplicate"
            ? problem.questions[0].choices.A
            : `  ${problem.questions[0].choices.A.toUpperCase()} `;
      expect(LsatGeneratedProblemSchema.safeParse(problem).success).toBe(false);
    }
  );

  it.each(["containmentSteps", "expectedNumericRanges"])("rejects incident keys missing %s", (field) => {
    const problem = structuredClone(workflowFixtures.INCIDENT_RESPONSE.generated);
    problem.hiddenAnswerKey[field] = [];
    expect(IncidentGeneratedProblemSchema.safeParse(problem).success).toBe(false);
  });

  it("rejects a set containing the same question twice even if its ID changes", () => {
    const problem = structuredClone(workflowFixtures.LSAT_LOGICAL_REASONING.generated);
    problem.questions[1] = { ...problem.questions[0], number: 2 };
    expect(LsatGeneratedProblemSchema.safeParse(problem).success).toBe(false);
  });
});

describe("rubric arithmetic", () => {
  it("cannot award 10/10 overall when every actual dimension is zero", () => {
    const feedback = structuredClone(workflowFixtures.MEMO_EXTRACTION.evaluation);
    feedback.overallScore = 10;
    feedback.dimensions.forEach((dimension) => {
      dimension.score = 0;
    });
    const parsed = MemoEvaluationSchema.parse(feedback);
    expect(validateRubricEvaluation(workflowFixtures.MEMO_EXTRACTION.generated, parsed)).toBe(0);
  });

  it("uses the saved max points and rounds only the final normalized total", () => {
    const problem = rubricProblem(5);
    const evaluation = rubricFeedback(5);
    problem.rubric.dimensions[0].maxScore = 5;
    evaluation.dimensions.forEach((dimension) => {
      dimension.score = 0;
    });
    evaluation.dimensions[0].score = 5;
    expect(validateRubricEvaluation(problem, evaluation)).toBe(1.1); // 5 / 45 * 10
  });
});
