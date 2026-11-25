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

// Must match the vector(1536) column in the semantic-dedup migration.
export const EMBEDDING_DIMENSIONS = 1536;

export type Embedder = (text: string) => Promise<number[]>;

// Returns the embedding vector, or null on any failure. Embedding must never
// block a problem from being saved, so callers treat null as "skip the
// semantic gate for this one".
export async function embedText(text: string, embed?: Embedder): Promise<number[] | null> {
  try {
    let vector: number[];
    if (embed) {
      vector = await embed(text);
    } else {
      const cfg = getConfig();
      const resp = await getOpenAI().embeddings.create({
        model: cfg.embedding.model,
        input: text,
        ...(cfg.embedding.model.startsWith("text-embedding-3-") ? { dimensions: EMBEDDING_DIMENSIONS } : {})
      });
      vector = resp.data[0]?.embedding;
    }
    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS ||
        vector.some((value) => !Number.isFinite(value)) || !vector.some((value) => value !== 0)) {
      throw new Error(`Embedding must be a finite nonzero ${EMBEDDING_DIMENSIONS}-dimension vector`);
    }
    return vector;
  } catch (err) {
    console.error("[embedText] embedding failed, skipping semantic dedup:", err);
    return null;
  }
}
