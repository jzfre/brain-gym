import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ExerciseSlug, Difficulty, PromptRole } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { loadAvoidanceHint } from "@/lib/memory/avoidance";

describe("loadAvoidanceHint", () => {
  let exerciseTypeId: string;
  let promptVersionId: string;

  beforeAll(async () => {
    const ex = await prisma.exerciseType.findUniqueOrThrow({ where: { slug: ExerciseSlug.MEMO_EXTRACTION } });
    exerciseTypeId = ex.id;
    const prompt = await prisma.promptVersion.findFirstOrThrow({
      where: { role: PromptRole.GENERATOR, exerciseTypeId, active: true }
    });
    promptVersionId = prompt.id;

    await prisma.problem.create({
      data: {
        exerciseTypeId,
        title: "Test avoidance memo",
        promptText: "x",
        userVisiblePayload: {},
        hiddenAnswerKey: {},
        rubric: {},
        timeboxMinutes: 25,
        suggestedPacing: [],
        requiredAnswerSections: [],
        difficulty: Difficulty.EASY,
        tags: ["avoid-tag"],
        uniquenessHash: "deadbeef",
        generatedByModel: "test",
        generationPromptVersionId: promptVersionId
      }
    });
  });

  afterAll(async () => {
    await prisma.problem.deleteMany({ where: { uniquenessHash: "deadbeef" } });
    await prisma.$disconnect();
  });

  it("returns recent titles, tags, hashes for the exercise type", async () => {
    const hint = await loadAvoidanceHint({ exerciseSlug: ExerciseSlug.MEMO_EXTRACTION, limit: 5 });
    expect(hint.recentHashes).toContain("deadbeef");
    expect(hint.recentTags).toContain("avoid-tag");
    expect(hint.recentTitles).toContain("Test avoidance memo");
  });
});
