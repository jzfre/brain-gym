import type { GenerateInput, GenerateResult } from "@/lib/exercises/types";
import { computeUniquenessHash } from "./uniqueness";
import type { SimilarProblem } from "./similarity";

export type DedupDeps = {
  generate: (input: GenerateInput) => Promise<GenerateResult>;
  isExactDuplicate?: (problem: GenerateResult["problem"]) => Promise<boolean>;
  embed: (text: string) => Promise<number[] | null>;
  findSimilar: (embedding: number[]) => Promise<SimilarProblem[]>;
  embeddingText: (problem: GenerateResult["problem"]) => string;
};

export type DedupConfig = { threshold: number; maxRetries: number };

export type DedupOutcome = {
  result: GenerateResult;
  attemptsUsed: number;
  embedding: number[] | null;
  nearestSimilarity: number | null;
  isNearDuplicate: boolean;
};

// Reactive gate + proactive steering in one loop. Generates a candidate, embeds
// checks exact collisions, then checks cosine similarity against prior problems. Under threshold ->
// accept. Over threshold -> remember the best (least-similar) candidate and
// regenerate with the colliding neighbors appended to the avoidance hint. After
// the retry budget, save the best candidate flagged as a near-duplicate. If
// embedding fails, accept once the exact gate passes; the DB unique index
// still handles concurrent insert races.
export async function generateUniqueProblem(args: {
  input: GenerateInput;
  deps: DedupDeps;
  config: DedupConfig;
}): Promise<DedupOutcome> {
  const { input, deps, config } = args;
  if (!Number.isInteger(config.maxRetries) || config.maxRetries < 1) {
    throw new Error("generateUniqueProblem: config.maxRetries must be >= 1");
  }
  let avoidance = input.avoidanceHint;
  let best: DedupOutcome | null = null;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    const result = await deps.generate({ difficulty: input.difficulty, avoidanceHint: avoidance });
    if (await deps.isExactDuplicate?.(result.problem)) {
      const p = result.problem;
      avoidance = {
        ...avoidance,
        recentTitles: [...avoidance.recentTitles, p.title],
        recentTags: [...avoidance.recentTags, ...p.tags],
        recentHashes: [
          ...avoidance.recentHashes,
          computeUniquenessHash({
            title: p.title,
            promptText: p.userVisiblePrompt,
            tags: p.tags,
            questions: p.questions
          })
        ]
      };
      continue;
    }
    const embedding = await deps.embed(deps.embeddingText(result.problem));

    if (!embedding) {
      return {
        result,
        attemptsUsed: attempt,
        embedding: null,
        nearestSimilarity: null,
        isNearDuplicate: false
      };
    }

    const neighbors = await deps.findSimilar(embedding);
    const maxSim = neighbors.length > 0 ? neighbors[0].similarity : 0;

    if (neighbors.length === 0 || maxSim < config.threshold) {
      return {
        result,
        attemptsUsed: attempt,
        embedding,
        nearestSimilarity: maxSim,
        isNearDuplicate: false
      };
    }

    // best.nearestSimilarity is always a number once best is set (it's assigned
    // maxSim below); the ?? 1 only satisfies the number|null type and is never hit.
    if (best === null || maxSim < (best.nearestSimilarity ?? 1)) {
      best = {
        result,
        attemptsUsed: attempt,
        embedding,
        nearestSimilarity: maxSim,
        isNearDuplicate: true
      };
    }

    avoidance = {
      ...avoidance,
      recentTitles: [...avoidance.recentTitles, ...neighbors.map((n) => n.title)],
      recentTags: [...avoidance.recentTags, ...neighbors.flatMap((n) => n.tags)]
    };
  }

  // An exact duplicate is never a valid fallback, even if embeddings are down.
  if (!best) throw new Error("Could not generate a distinct problem within the retry budget");
  return { ...best, attemptsUsed: config.maxRetries };
}
