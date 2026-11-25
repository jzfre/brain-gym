import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
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

// Exercise the real SDK conversion: mocked model responses alone cannot catch
// schema incompatibility when either OpenAI or Zod is upgraded.
function assertStrictObjects(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  if (node.type === "object") {
    expect(node.additionalProperties).toBe(false);
    expect([...(node.required as string[])].sort()).toEqual(
      Object.keys(node.properties as object).sort()
    );
  }
  for (const child of Object.values(node)) assertStrictObjects(child);
}

describe("OpenAI structured output schema compatibility", () => {
  it.each([
    ["MemoGeneration", MemoGeneratedProblemSchema],
    ["MemoEvaluation", MemoEvaluationSchema],
    ["IncidentGeneration", IncidentGeneratedProblemSchema],
    ["IncidentEvaluation", IncidentEvaluationSchema],
    ["LsatGeneration", LsatGeneratedProblemSchema],
    ["LsatEvaluation", LsatEvaluationSchema]
  ] as const)("converts %s to strict JSON schema using the installed SDK", (name, schema) => {
    const format = zodTextFormat(schema, name);
    expect(format.type).toBe("json_schema");
    expect(format.strict).toBe(true);
    expect(format.schema.type).toBe("object");
    assertStrictObjects(format.schema);
  });
});
