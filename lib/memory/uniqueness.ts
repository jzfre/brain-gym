import { createHash } from "node:crypto";

export type UniquenessInput = {
  title: string;
  promptText: string;
  tags: string[];
  questions?: Array<{ stimulus: string; questionStem: string; choices: Record<string, string> }>;
};

export function computeUniquenessHash(input: UniquenessInput): string {
  const normalizedTitle = input.title.trim().toLowerCase().replace(/\s+/g, " ");
  const normalizedPromptStart = input.promptText
    .trim()
    .slice(0, 200)
    .toLowerCase()
    .replace(/\s+/g, " ");
  const normalizedTags = [...input.tags].map((t) => t.trim().toLowerCase()).sort();
  const canonical = JSON.stringify({
    title: normalizedTitle,
    prompt: normalizedPromptStart,
    tags: normalizedTags,
    // Include the actual LSAT set, not just its synthesized count sentence.
    // Sort option text so application shuffling does not evade the exact gate.
    ...(input.questions?.length
      ? {
          questions: input.questions.map((question) => ({
            stimulus: question.stimulus.trim().toLowerCase().replace(/\s+/g, " "),
            stem: question.questionStem.trim().toLowerCase().replace(/\s+/g, " "),
            choices: Object.values(question.choices)
              .map((choice) => choice.trim().toLowerCase().replace(/\s+/g, " "))
              .sort()
          }))
        }
      : {})
  });
  return createHash("sha256").update(canonical).digest("hex");
}
