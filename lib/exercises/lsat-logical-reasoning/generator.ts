import { ExerciseSlug, ModelRunPurpose, PromptRole, Difficulty } from "@prisma/client";
import { loadActivePrompt } from "@/lib/prompts/registry";
import { runStructured } from "@/lib/openai/run-model";
import { getConfig } from "@/lib/config";
import type { GenerateInput, GenerateResult, LsatPublicQuestion } from "@/lib/exercises/types";
import { LsatGeneratedProblemSchema } from "./schemas";

// Questions per set, sized so a session is roughly 45 minutes (harder questions
// take longer each, so fewer of them). One-line tweak if the target changes.
const SET_SIZE: Record<Difficulty, number> = {
  [Difficulty.EASY]: 9,
  [Difficulty.MEDIUM]: 7,
  [Difficulty.HARD]: 5
};

export async function generateLsatProblem(input: GenerateInput): Promise<GenerateResult> {
  const cfg = getConfig();
  const base = await loadActivePrompt({ role: PromptRole.BASE });
  const gen = await loadActivePrompt({ role: PromptRole.GENERATOR, exerciseSlug: ExerciseSlug.LSAT_LOGICAL_REASONING });

  const count = SET_SIZE[input.difficulty];
  const userPayload = [
    `Generate a ${input.difficulty} original LSAT logical-reasoning set of EXACTLY ${count} questions.`,
    "Number them 1..N in order. Rotate question types across the set.",
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

  const p = result.parsed;

  // Split each generated question into the public part (shown to the user) and
  // the hidden answer key.
  const questions: LsatPublicQuestion[] = p.questions.map((q) => ({
    number: q.number,
    stimulus: q.stimulus,
    questionStem: q.questionStem,
    choices: q.choices,
    questionType: q.questionType
  }));
  const answers = p.questions.map((q) => ({
    number: q.number,
    correctChoice: q.correctChoice,
    explanation: q.explanation,
    distractorAnalyses: q.distractorAnalyses,
    questionType: q.questionType
  }));

  const problem: GenerateResult["problem"] = {
    title: p.title,
    difficulty: p.difficulty,
    timeboxMinutes: p.timeboxMinutes,
    suggestedPacing: p.suggestedPacing,
    // Synthesized label/hash source; the LSAT UI renders `questions`, not this.
    userVisiblePrompt: `LSAT logical-reasoning set — ${questions.length} questions. For each, pick A–E and give a one–two sentence reason.`,
    requiredAnswerSections: [],
    hiddenAnswerKey: { answers },
    rubric: p.rubric,
    tags: p.tags,
    sourceCitations: p.sourceCitations,
    duplicateAvoidanceKey: p.duplicateAvoidanceKey,
    questions
  };

  return { problem, modelRunId: result.modelRunId };
}
