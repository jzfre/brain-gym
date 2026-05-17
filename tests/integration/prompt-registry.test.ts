import { describe, it, expect, afterAll } from "vitest";
import { ExerciseSlug, PromptRole } from "@prisma/client";
import { loadActivePrompt } from "@/lib/prompts/registry";
import { prisma } from "@/lib/db/client";

describe("loadActivePrompt", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns the active base prompt", async () => {
    const p = await loadActivePrompt({ role: PromptRole.BASE });
    expect(p.content.length).toBeGreaterThan(50);
    expect(p.role).toBe(PromptRole.BASE);
  });

  it("returns mode-specific generator prompts", async () => {
    const p = await loadActivePrompt({
      role: PromptRole.GENERATOR,
      exerciseSlug: ExerciseSlug.MEMO_EXTRACTION
    });
    expect(p.content).toMatch(/memo-extraction/i);
  });

  it("throws when no active prompt exists", async () => {
    await expect(loadActivePrompt({ role: PromptRole.WEEKLY_REVIEW })).rejects.toThrow(/no active prompt/i);
  });
});
