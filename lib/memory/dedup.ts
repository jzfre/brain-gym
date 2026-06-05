import type { GenerateInput, GenerateResult } from "@/lib/exercises/types";
import type { SimilarProblem } from "./similarity";

export type DedupDeps = {
  generate: (input: GenerateInput) => Promise<GenerateResult>;
  embed: (text: string) => Promise<number[] | null>;
  findSimilar: (embedding: number[]) => Promise<SimilarProblem[]>;
  embeddingText: (problem: GenerateResult["problem"]) => string;
};

export type DedupConfig = { threshold: number; maxRetries: number };

export type DedupOutcome = {
  result: GenerateResult;
  embedding: number[] | null;
  nearestSimilarity: number | null;
  isNearDuplicate: boolean;
};

// Reactive gate + proactive steering in one loop. Generates a candidate, embeds
// it, and checks cosine similarity against prior problems. Under threshold ->
// accept. Over threshold -> remember the best (least-similar) candidate and
// regenerate with the colliding neighbors appended to the avoidance hint. After
// the retry budget, save the best candidate flagged as a near-duplicate. If
// embedding fails, accept immediately (hash layer still applies downstream).
export async function generateUniqueProblem(args: {
  input: GenerateInput;
  deps: DedupDeps;
  config: DedupConfig;
}): Promise<DedupOutcome> {
  const { input, deps, config } = args;
  if (config.maxRetries < 1) {
    throw new Error("generateUniqueProblem: config.maxRetries must be >= 1");
  }
  let avoidance = input.avoidanceHint;
  let best: DedupOutcome | null = null;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    const result = await deps.generate({ difficulty: input.difficulty, avoidanceHint: avoidance });
    const embedding = await deps.embed(deps.embeddingText(result.problem));

    if (!embedding) {
      return { result, embedding: null, nearestSimilarity: null, isNearDuplicate: false };
    }

    const neighbors = await deps.findSimilar(embedding);
    const maxSim = neighbors.length > 0 ? neighbors[0].similarity : 0;

    if (maxSim < config.threshold) {
      return { result, embedding, nearestSimilarity: maxSim, isNearDuplicate: false };
    }

    // best.nearestSimilarity is always a number once best is set (it's assigned
    // maxSim below); the ?? 1 only satisfies the number|null type and is never hit.
    if (best === null || maxSim < (best.nearestSimilarity ?? 1)) {
      best = { result, embedding, nearestSimilarity: maxSim, isNearDuplicate: true };
    }

    avoidance = {
      ...avoidance,
      recentTitles: [...avoidance.recentTitles, ...neighbors.map((n) => n.title)],
      recentTags: [...avoidance.recentTags, ...neighbors.flatMap((n) => n.tags)]
    };
  }

  // Every attempt exceeded the threshold; `best` is guaranteed set here.
  return best as DedupOutcome;
}
