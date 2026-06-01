type EmbeddingTextInput = {
  title: string;
  userVisiblePrompt: string;
  tags: string[];
  questions?: Array<{ stimulus: string; questionStem: string }>;
};

// The single source of truth for what text represents a problem. Used by the
// dedup gate. Keep stable: changing it invalidates comparisons against older
// embeddings.
export function problemEmbeddingText(p: EmbeddingTextInput): string {
  const tagStr = [...p.tags].map((t) => t.trim().toLowerCase()).sort().join(", ");
  const lsat =
    p.questions && p.questions.length > 0
      ? "\n" + p.questions.map((q) => `${q.stimulus}\n${q.questionStem}`).join("\n")
      : "";
  return [p.title.trim(), p.userVisiblePrompt.trim(), tagStr].join("\n") + lsat;
}
