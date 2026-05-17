import { ExerciseSlug, ModelRunPurpose, PromptRole } from "@prisma/client";
import { loadActivePrompt } from "@/lib/prompts/registry";
import { runStructured } from "@/lib/openai/run-model";
import { getConfig } from "@/lib/config";
import type { GenerateInput, GenerateResult } from "@/lib/exercises/types";
import { IncidentGeneratedProblemSchema } from "./schemas";

export async function generateIncidentProblem(input: GenerateInput): Promise<GenerateResult> {
  const cfg = getConfig();
  const base = await loadActivePrompt({ role: PromptRole.BASE });
  const gen = await loadActivePrompt({ role: PromptRole.GENERATOR, exerciseSlug: ExerciseSlug.INCIDENT_RESPONSE });

  const userPayload = [
    `Generate a ${input.difficulty} incident-response scenario.`,
    "",
    "Avoid these recent items:",
    JSON.stringify(input.avoidanceHint, null, 2)
  ].join("\n");

  const result = await runStructured({
    purpose: ModelRunPurpose.GENERATE_PROBLEM,
    model: cfg.openai.model,
    reasoningEffort: cfg.openai.reasoningEffort,
    schema: IncidentGeneratedProblemSchema,
    schemaName: "IncidentGeneratedProblem",
    tools: [{ type: "web_search" }],
    input: [
      { role: "system", content: base.content },
      { role: "system", content: gen.content },
      { role: "user", content: userPayload }
    ]
  });

  return { problem: result.parsed, modelRunId: result.modelRunId };
}
