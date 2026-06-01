import { getOpenAI } from "@/lib/openai/client";
import { getConfig } from "@/lib/config";

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
  const base = [p.title.trim(), p.userVisiblePrompt.trim(), tagStr].filter((s) => s.length > 0).join("\n");
  const lsat =
    p.questions && p.questions.length > 0
      ? "\n" + p.questions.map((q) => `${q.stimulus.trim()}\n${q.questionStem.trim()}`).join("\n")
      : "";
  return base + lsat;
}

export type Embedder = (text: string) => Promise<number[]>;

// Returns the embedding vector, or null on any failure. Embedding must never
// block a problem from being saved, so callers treat null as "skip the
// semantic gate for this one".
export async function embedText(text: string, embed?: Embedder): Promise<number[] | null> {
  try {
    if (embed) return await embed(text);
    const cfg = getConfig();
    const resp = await getOpenAI().embeddings.create({ model: cfg.embedding.model, input: text });
    return resp.data[0].embedding;
  } catch {
    return null;
  }
}
