import { ExerciseSlug, ModelRunPurpose, PromptRole } from "@prisma/client";
import { loadActivePrompt } from "@/lib/prompts/registry";
import { runStructured } from "@/lib/openai/run-model";
import { getConfig } from "@/lib/config";
import type { GenerateInput, GenerateResult } from "@/lib/exercises/types";
import { MemoGeneratedProblemSchema } from "./schemas";

export async function generateMemoProblem(input: GenerateInput): Promise<GenerateResult> {
  const cfg = getConfig();
  const base = await loadActivePrompt({ role: PromptRole.BASE });
  const gen = await loadActivePrompt({ role: PromptRole.GENERATOR, exerciseSlug: ExerciseSlug.MEMO_EXTRACTION });

  const userPayload = [
    `Generate a ${input.difficulty} memo-extraction problem.`,
    "",
    "Avoid these recent items (titles, tags, source URLs):",
    JSON.stringify(input.avoidanceHint, null, 2)
  ].join("\n");

  const result = await runStructured({
    purpose: ModelRunPurpose.GENERATE_PROBLEM,
    model: cfg.openai.model,
    reasoningEffort: cfg.openai.reasoningEffort,
    schema: MemoGeneratedProblemSchema,
    schemaName: "MemoGeneratedProblem",
    tools: [{ type: "web_search" }],
    input: [
      { role: "system", content: base.content },
      { role: "system", content: gen.content },
      { role: "user", content: userPayload }
    ]
  });

  return { problem: result.parsed, modelRunId: result.modelRunId };
}
