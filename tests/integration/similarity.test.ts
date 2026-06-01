import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ExerciseSlug, Difficulty, PromptRole } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { findSimilarProblems } from "@/lib/memory/similarity";

// Build a 1536-dim unit vector with a 1 at `axis`, else 0. Cosine similarity
// between two such vectors is 1 if same axis, 0 if different axes.
function axisVector(axis: number): number[] {
  const v = new Array(1536).fill(0);
  v[axis] = 1;
  return v;
}

async function setEmbedding(problemId: string, vec: number[]) {
  const literal = `[${vec.join(",")}]`;
  await prisma.$executeRaw`UPDATE "Problem" SET embedding = ${literal}::vector WHERE id = ${problemId}`;
}

describe("findSimilarProblems", () => {
  let exerciseTypeId: string;
  let promptVersionId: string;
  const ids: string[] = [];

  beforeAll(async () => {
    const ex = await prisma.exerciseType.findUniqueOrThrow({ where: { slug: ExerciseSlug.MEMO_EXTRACTION } });
    exerciseTypeId = ex.id;
    const prompt = await prisma.promptVersion.findFirstOrThrow({
      where: { role: PromptRole.GENERATOR, exerciseTypeId, active: true }
    });
    promptVersionId = prompt.id;

    async function make(title: string, hash: string, axis: number, tags: string[] = []) {
      const p = await prisma.problem.create({
        data: {
          exerciseTypeId,
          title,
          promptText: "x",
          userVisiblePayload: {},
          hiddenAnswerKey: {},
          rubric: {},
          timeboxMinutes: 25,
          suggestedPacing: [],
          requiredAnswerSections: [],
          difficulty: Difficulty.EASY,
          tags,
          uniquenessHash: hash,
          generatedByModel: "test",
          generationPromptVersionId: promptVersionId
        }
      });
      ids.push(p.id);
      await setEmbedding(p.id, axisVector(axis));
      return p.id;
    }

    await make("sim-near", "sim-hash-near", 0, ["concept-a"]); // identical axis to query -> sim 1
    await make("sim-far", "sim-hash-far", 5); // different axis -> sim 0
  });

  afterAll(async () => {
    await prisma.problem.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it("returns nearest first with correct similarity", async () => {
    const rows = await findSimilarProblems({ exerciseTypeId, embedding: axisVector(0), k: 5 });
    expect(rows[0].title).toBe("sim-near");
    expect(rows[0].tags).toEqual(["concept-a"]);
    expect(rows[0].similarity).toBeGreaterThan(0.99);
    const far = rows.find((r) => r.title === "sim-far");
    expect(far?.similarity ?? 0).toBeLessThan(0.01);
  });

  it("scopes to the given exercise type", async () => {
    const otherType = await prisma.exerciseType.findUniqueOrThrow({ where: { slug: ExerciseSlug.LSAT_LOGICAL_REASONING } });
    const rows = await findSimilarProblems({ exerciseTypeId: otherType.id, embedding: axisVector(0), k: 5 });
    expect(rows.find((r) => r.title === "sim-near")).toBeUndefined();
  });
});
