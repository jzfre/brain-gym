import { ExerciseSlug, ModelRunPurpose, PromptRole, Difficulty } from "@prisma/client";
import { loadActivePrompt } from "@/lib/prompts/registry";
import { runStructured } from "@/lib/openai/run-model";
import { getConfig } from "@/lib/config";
import type { GenerateInput, GenerateResult, LsatPublicQuestion } from "@/lib/exercises/types";
import { LsatGeneratedProblemSchema } from "./schemas";

// Questions per set: easy is a short warm-up session, medium and hard are full
// sessions — hard keeps the same volume but the questions themselves are much
// tougher (see DIFFICULTY_BRIEF and the generator prompt).
export const SET_SIZE: Record<Difficulty, number> = {
  [Difficulty.EASY]: 5,
  [Difficulty.MEDIUM]: 9,
  [Difficulty.HARD]: 9
};

// Per-question time budget; the set's timebox is derived, not model-chosen:
// EASY 5×5 = 25 min, MEDIUM/HARD 9×5 = 45 min.
export const MINUTES_PER_QUESTION = 5;

// Difficulty-specific generation instructions, passed in the user message so
// they always match the requested difficulty (the prompt file describes the
// scale; this pins the concrete ask for this set).
const DIFFICULTY_BRIEF: Record<Difficulty, string> = {
  [Difficulty.EASY]:
    "Easy set: common question types (Assumption, Flaw, Weaken, Strengthen, Inference), " +
    "compact stimuli, distractors that are clearly wrong on a careful read.",
  [Difficulty.MEDIUM]:
    "Medium set: rotate widely across question types, moderately dense stimuli, " +
    "at least one attractive distractor per question.",
  [Difficulty.HARD]:
    "Hard set: genuinely difficult questions. Use the toughest question types for most of " +
    "the set (Parallel reasoning, Parallel flaw, Principle, Necessary vs sufficient assumption, " +
    "formal-logic/conditional chains). Dense multi-sentence stimuli with subtle scope shifts; " +
    "quantifier and modal traps; every question needs at least one near-miss distractor that is " +
    "half-right, and the correct answer should often be phrased unattractively. Target the " +
    "difficulty of the hardest published LSAT items (without copying any)."
};

export async function generateLsatProblem(input: GenerateInput): Promise<GenerateResult> {
  const cfg = getConfig();
  const base = await loadActivePrompt({ role: PromptRole.BASE });
  const gen = await loadActivePrompt({ role: PromptRole.GENERATOR, exerciseSlug: ExerciseSlug.LSAT_LOGICAL_REASONING });

  const count = SET_SIZE[input.difficulty];
  const userPayload = [
    `Generate a ${input.difficulty} original LSAT logical-reasoning set of EXACTLY ${count} questions.`,
    "Number them 1..N in order. Rotate question types across the set.",
    DIFFICULTY_BRIEF[input.difficulty],
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
    // Derived from the actual set size, not trusted to the model: the timer
    // and pacing UI depend on it being exactly per-question budget × count.
    timeboxMinutes: questions.length * MINUTES_PER_QUESTION,
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
