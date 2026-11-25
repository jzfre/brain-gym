import { z } from "zod";
import { NonBlank, nonBlankText, TimeboxMinutes, PacingItem, SourceCitation, uniqueNames } from "../contracts";

const DifficultyEnum = z.enum(["EASY", "MEDIUM", "HARD"]);
const Choice = z.enum(["A", "B", "C", "D", "E"]);
const RubricDimension = z.object({ name: NonBlank, maxScore: z.number().positive().max(10), description: NonBlank });

const ChoiceTexts = z.object({ A: NonBlank, B: NonBlank, C: NonBlank, D: NonBlank, E: NonBlank });

// One generated question, including its (hidden) answer key. The generate route
// splits this into a public part (userVisiblePayload.questions) and a hidden part
// (hiddenAnswerKey.answers).
const GeneratedQuestion = z.object({
  number: z.number().int().positive(),
  stimulus: nonBlankText(30),
  questionStem: nonBlankText(5),
  choices: ChoiceTexts.refine((choices) => uniqueNames(Object.values(choices)), "Answer choices must be distinct"),
  questionType: nonBlankText(3),
  correctChoice: Choice,
  explanation: nonBlankText(10),
  distractorAnalyses: ChoiceTexts
});

// A LSAT problem is a SET of questions. Length is flexible (the generator asks
// for a difficulty-specific count); we validate a sane range rather than a fixed
// length so an off-by-one from the model doesn't fail the whole generation.
export const LsatGeneratedProblemSchema = z.object({
  title: nonBlankText(3),
  difficulty: DifficultyEnum,
  timeboxMinutes: TimeboxMinutes,
  suggestedPacing: z.array(PacingItem).min(1),
  questions: z.array(GeneratedQuestion).min(3).max(12).refine((questions) => uniqueNames(questions.map((question) =>
    JSON.stringify([question.stimulus, question.questionStem, Object.values(question.choices).map((choice) => choice.trim().toLowerCase()).sort()])
  )), "Questions within a set must be distinct"),
  rubric: z.object({ dimensions: z.array(RubricDimension).min(1) }),
  tags: z.array(NonBlank).min(1).max(8),
  sourceCitations: z.array(SourceCitation),
  duplicateAvoidanceKey: nonBlankText(3)
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
  explanation: nonBlankText(5),
  reasoningCritique: nonBlankText(3),
  missClassification: MissClass.nullable()
});

export const LsatEvaluationSchema = z.object({
  shortDiagnosis: nonBlankText(5),
  summary: nonBlankText(10),
  topFixes: z.array(z.string()).min(1).max(3),
  nextRep: nonBlankText(3),
  errorPatternTags: z.array(z.string()).max(8),
  questions: z.array(ModelQuestionEval).min(1)
});

export type LsatGeneratedProblem = z.infer<typeof LsatGeneratedProblemSchema>;
export type LsatModelEvaluation = z.infer<typeof LsatEvaluationSchema>;
export type LsatGeneratedQuestion = z.infer<typeof GeneratedQuestion>;

// Submitted answer format is independent of the model's output schema.
export const LsatUserAnswerSchema = z.object({
  answers: z.array(z.object({
    number: z.number().int().positive(),
    choice: z.string().transform((value) => value.trim().toUpperCase()).pipe(z.enum(["", "A", "B", "C", "D", "E"])),
    reasoning: z.string().optional().default("")
  })).refine((answers) => new Set(answers.map((answer) => answer.number)).size === answers.length, {
    message: "Duplicate question numbers in submission"
  })
});
