import { ExerciseSlug, ModelRunPurpose, PromptRole } from "@prisma/client";
import { loadActivePrompt } from "@/lib/prompts/registry";
import { runStructured } from "@/lib/openai/run-model";
import { getConfig } from "@/lib/config";
import type { GenerateInput, GenerateResult } from "@/lib/exercises/types";
import { LsatGeneratedProblemSchema } from "./schemas";

export async function generateLsatProblem(input: GenerateInput): Promise<GenerateResult> {
  const cfg = getConfig();
  const base = await loadActivePrompt({ role: PromptRole.BASE });
  const gen = await loadActivePrompt({ role: PromptRole.GENERATOR, exerciseSlug: ExerciseSlug.LSAT_LOGICAL_REASONING });

  const userPayload = [
    `Generate a ${input.difficulty} original LSAT logical-reasoning question.`,
    "",
    "Avoid these recent items (titles, tags, question types):",
    JSON.stringify(input.avoidanceHint, null, 2)
  ].join("\n");

  const result = await runStructured({
    purpose: ModelRunPurpose.GENERATE_PROBLEM,
    model: cfg.openai.model,
    reasoningEffort: cfg.openai.reasoningEffort,
    schema: LsatGeneratedProblemSchema,
    schemaName: "LsatGeneratedProblem",
    input: [
      { role: "system", content: base.content },
      { role: "system", content: gen.content },
      { role: "user", content: userPayload }
    ]
  });

  return { problem: result.parsed, modelRunId: result.modelRunId };
}
