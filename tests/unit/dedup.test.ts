import { describe, it, expect, vi } from "vitest";
import { generateUniqueProblem } from "@/lib/memory/dedup";
import type { GenerateInput, GenerateResult } from "@/lib/exercises/types";

const baseInput: GenerateInput = {
  difficulty: "EASY" as GenerateInput["difficulty"],
  avoidanceHint: { recentTitles: [], recentTags: [], recentSourceUrls: [], recentHashes: [] }
};

function fakeResult(title: string): GenerateResult {
  return {
    modelRunId: "run-" + title,
    problem: {
      title,
      difficulty: "EASY" as GenerateResult["problem"]["difficulty"],
      timeboxMinutes: 25,
      suggestedPacing: [],
      userVisiblePrompt: "prompt " + title,
      requiredAnswerSections: [],
      hiddenAnswerKey: {},
      rubric: { dimensions: [] },
      tags: [],
      sourceCitations: [],
      duplicateAvoidanceKey: title
    }
  };
}

const config = { threshold: 0.85, maxRetries: 3 };
const deps0 = {
  embed: async () => [1, 0, 0],
  embeddingText: () => "text"
};

it("accepts on attempt 1 when below threshold", async () => {
  const generate = vi.fn(async () => fakeResult("A"));
  const out = await generateUniqueProblem({
    input: baseInput,
    config,
    deps: { ...deps0, generate, findSimilar: async () => [{ id: "1", title: "old", tags: [], similarity: 0.2 }] }
  });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(out.isNearDuplicate).toBe(false);
  expect(out.nearestSimilarity).toBeCloseTo(0.2);
  expect(out.result.problem.title).toBe("A");
});

it("retries up to maxRetries then flags the least-similar candidate", async () => {
  let n = 0;
  const sims = [0.95, 0.9, 0.92]; // all above threshold; min is 0.9 (attempt 2)
  const generate = vi.fn(async () => fakeResult("cand" + n));
  const findSimilar = vi.fn(async () => [{ id: "x", title: "near", tags: ["t"], similarity: sims[n++] }]);
  const out = await generateUniqueProblem({
    input: baseInput,
    config,
    deps: { ...deps0, generate, findSimilar }
  });
  expect(generate).toHaveBeenCalledTimes(3);
  expect(out.isNearDuplicate).toBe(true);
  expect(out.nearestSimilarity).toBeCloseTo(0.9);
});

it("steers retries by appending colliding neighbors to the avoidance hint", async () => {
  let n = 0;
  const generate = vi.fn(async () => fakeResult("c" + n));
  const findSimilar = vi.fn(async () => {
    n++;
    return n === 1
      ? [{ id: "x", title: "Collider", tags: ["dup-tag"], similarity: 0.95 }]
      : [{ id: "y", title: "ok", tags: [], similarity: 0.1 }];
  });
  await generateUniqueProblem({ input: baseInput, config, deps: { ...deps0, generate, findSimilar } });
  const secondCallHint = (generate.mock.calls[1] as unknown as [GenerateInput])[0].avoidanceHint;
  expect(secondCallHint.recentTitles).toContain("Collider");
  expect(secondCallHint.recentTags).toContain("dup-tag");
});

it("accepts immediately and returns null embedding when embed fails", async () => {
  const generate = vi.fn(async () => fakeResult("A"));
  const findSimilar = vi.fn(async () => []);
  const out = await generateUniqueProblem({
    input: baseInput,
    config,
    deps: { generate, findSimilar, embeddingText: () => "t", embed: async () => null }
  });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(findSimilar).not.toHaveBeenCalled();
  expect(out.embedding).toBeNull();
  expect(out.isNearDuplicate).toBe(false);
});
