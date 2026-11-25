import type { EvaluationCommon, GeneratedProblemCommon } from "./types";

/** Reject structurally valid model feedback that cannot be scored against this problem. */
export function validateRubricEvaluation(
  problem: GeneratedProblemCommon,
  evaluation: EvaluationCommon
): number {
  const normalize = (name: string) => name.trim().toLowerCase();
  const rubric = new Map(problem.rubric.dimensions.map((d) => [normalize(d.name), d]));
  if (rubric.size !== problem.rubric.dimensions.length || rubric.has("") || rubric.size === 0) {
    throw new Error("Evaluation: problem has an invalid rubric");
  }
  const seen = new Set<string>();
  for (const dimension of evaluation.dimensions) {
    const name = normalize(dimension.name);
    const expected = rubric.get(name);
    if (!expected || seen.has(name)) {
      throw new Error(`Evaluation: unexpected or duplicate rubric dimension: ${dimension.name}`);
    }
    if (
      !Number.isFinite(expected.maxScore) ||
      expected.maxScore <= 0 ||
      !Number.isFinite(dimension.score) ||
      dimension.score < 0 ||
      dimension.score > expected.maxScore
    ) {
      throw new Error(`Evaluation: score outside rubric range for ${dimension.name}`);
    }
    seen.add(name);
  }
  if (seen.size !== rubric.size) {
    throw new Error("Evaluation: feedback is missing rubric dimensions");
  }
  const earned = evaluation.dimensions.reduce((sum, dimension) => sum + dimension.score, 0);
  const possible = [...rubric.values()].reduce((sum, dimension) => sum + dimension.maxScore, 0);
  return Math.round((earned / possible) * 100) / 10;
}
