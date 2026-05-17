import { createHash } from "node:crypto";

export type UniquenessInput = {
  title: string;
  promptText: string;
  tags: string[];
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
    tags: normalizedTags
  });
  return createHash("sha256").update(canonical).digest("hex");
}
