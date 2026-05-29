import { z } from "zod";

const DifficultyEnum = z.enum(["EASY", "MEDIUM", "HARD"]);
const Choice = z.enum(["A", "B", "C", "D", "E"]);
const PacingItem = z.object({ label: z.string(), minutes: z.number().int().positive() });
const RubricDimension = z.object({
  name: z.string(),
  maxScore: z.number().positive(),
  description: z.string()
});
const SourceCitation = z.object({
  title: z.string(),
  url: z.string(),
  publisher: z.string().nullable()
});

const ChoiceTexts = z.object({
  A: z.string(),
  B: z.string(),
  C: z.string(),
  D: z.string(),
  E: z.string()
});

// One generated question, including its (hidden) answer key. The generate route
// splits this into a public part (userVisiblePayload.questions) and a hidden part
// (hiddenAnswerKey.answers).
const GeneratedQuestion = z.object({
  number: z.number().int().positive(),
  stimulus: z.string().min(30),
  questionStem: z.string().min(5),
  choices: ChoiceTexts,
  questionType: z.string().min(3),
  correctChoice: Choice,
  explanation: z.string().min(10),
  distractorAnalyses: ChoiceTexts
});

// A LSAT problem is a SET of questions. Length is flexible (the generator asks
// for a difficulty-specific count); we validate a sane range rather than a fixed
// length so an off-by-one from the model doesn't fail the whole generation.
export const LsatGeneratedProblemSchema = z.object({
  title: z.string().min(3),
  difficulty: DifficultyEnum,
  timeboxMinutes: z.number().int().positive(),
  suggestedPacing: z.array(PacingItem).min(1),
  questions: z.array(GeneratedQuestion).min(3).max(12),
  rubric: z.object({ dimensions: z.array(RubricDimension).min(1) }),
  tags: z.array(z.string()).min(1).max(8),
  sourceCitations: z.array(SourceCitation),
  duplicateAvoidanceKey: z.string().min(3)
});

const MissClass = z.enum([
  "english_comprehension",
  "logic",
  "question_type_confusion",
  "too_strong",
  "too_narrow",
  "wrong_conclusion",
  "quantifier_modal"
]);

// What the evaluator MODEL returns: per-question explanation + a critique of the
// user's reasoning, plus a set-level summary. Correctness (which letter is right,
// whether the user got it) is computed deterministically in the evaluator, not
// trusted to the model.
const ModelQuestionEval = z.object({
  number: z.number().int().positive(),
  explanation: z.string().min(5),
  reasoningCritique: z.string().min(3),
  missClassification: MissClass.nullable()
});

export const LsatEvaluationSchema = z.object({
  shortDiagnosis: z.string().min(5),
  summary: z.string().min(10),
  topFixes: z.array(z.string()).min(1).max(3),
  nextRep: z.string().min(3),
  errorPatternTags: z.array(z.string()).max(8),
  questions: z.array(ModelQuestionEval).min(1)
});

export type LsatGeneratedProblem = z.infer<typeof LsatGeneratedProblemSchema>;
export type LsatModelEvaluation = z.infer<typeof LsatEvaluationSchema>;
export type LsatGeneratedQuestion = z.infer<typeof GeneratedQuestion>;
