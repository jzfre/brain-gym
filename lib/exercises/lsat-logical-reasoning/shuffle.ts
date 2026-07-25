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
 * Randomizes the displayed answer order and remaps every label-dependent field.
 * The model's original answer positions are never exposed directly to the user.
 */
export function shuffleLsatQuestion(
  question: LsatGeneratedQuestion,
  random: () => number = Math.random
): LsatGeneratedQuestion {
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
