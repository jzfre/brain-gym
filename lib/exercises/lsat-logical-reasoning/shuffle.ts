import type { LsatGeneratedQuestion } from "./schemas";

const CHOICE_LABELS = ["A", "B", "C", "D", "E"] as const;

type ChoiceLabel = (typeof CHOICE_LABELS)[number];

function shuffleLabels(random: () => number): ChoiceLabel[] {
  const labels = [...CHOICE_LABELS];
  for (let i = labels.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [labels[i], labels[j]] = [labels[j], labels[i]];
  }
  return labels;
}

/**
 * Randomizes label-independent questions; preserves the original order whenever
 * prose might refer to option letters. Rewriting arbitrary prose is unsafe.
 * This is deliberately conservative; references can be phrased in many ways.
 */
export function shuffleLsatQuestion(
  question: LsatGeneratedQuestion,
  random: () => number = Math.random
): LsatGeneratedQuestion {
  const prose = [
    question.stimulus,
    question.questionStem,
    question.explanation,
    ...Object.values(question.choices),
    ...Object.values(question.distractorAnalyses)
  ];
  // Includes articles "a"/"A" and common positional phrasing. False positives
  // reduce randomization; missing a reference can change the correct answer.
  // This is a conservative guard, not a semantic proof of label independence.
  const letterReference = /\b[a-e]\b/i;
  const positionReference =
    /\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|preceding|previous|following|next|above|below|former|latter)\s+(answer|option|choice)s?\b|\b(answer|option|choice)s?\s+(one|two|three|four|five|[1-5])\b|\b(both|all|none|neither|either|any)\b.{0,40}\b(above|below|preceding|following)\b/i;
  if (prose.some((text) => letterReference.test(text) || positionReference.test(text))) {
    return structuredClone(question);
  }
  const sourceLabels = shuffleLabels(random);

  const choices = {} as LsatGeneratedQuestion["choices"];
  const distractorAnalyses = {} as LsatGeneratedQuestion["distractorAnalyses"];
  let correctChoice: ChoiceLabel | undefined;

  CHOICE_LABELS.forEach((displayLabel, index) => {
    const sourceLabel = sourceLabels[index];
    choices[displayLabel] = question.choices[sourceLabel];
    distractorAnalyses[displayLabel] = question.distractorAnalyses[sourceLabel];
    if (sourceLabel === question.correctChoice) correctChoice = displayLabel;
  });

  if (!correctChoice) {
    throw new Error(`Could not remap correct LSAT choice for question ${question.number}`);
  }

  return {
    ...question,
    choices,
    correctChoice,
    distractorAnalyses
  };
}
