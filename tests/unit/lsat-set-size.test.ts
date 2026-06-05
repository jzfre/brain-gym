import { describe, it, expect } from "vitest";
import { Difficulty } from "@prisma/client";
import { MINUTES_PER_QUESTION, SET_SIZE } from "@/lib/exercises/lsat-logical-reasoning/generator";

describe("LSAT set sizing", () => {
  it("easy is a 5-question warm-up", () => {
    expect(SET_SIZE[Difficulty.EASY]).toBe(5);
  });

  it("medium and hard are full 9-question sessions", () => {
    expect(SET_SIZE[Difficulty.MEDIUM]).toBe(9);
    expect(SET_SIZE[Difficulty.HARD]).toBe(9);
  });

  it("derived timeboxes are 25/45/45 minutes", () => {
    expect(SET_SIZE[Difficulty.EASY] * MINUTES_PER_QUESTION).toBe(25);
    expect(SET_SIZE[Difficulty.MEDIUM] * MINUTES_PER_QUESTION).toBe(45);
    expect(SET_SIZE[Difficulty.HARD] * MINUTES_PER_QUESTION).toBe(45);
  });

  it("set sizes fit the generation schema bounds (3..12)", () => {
    for (const d of [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD]) {
      expect(SET_SIZE[d]).toBeGreaterThanOrEqual(3);
      expect(SET_SIZE[d]).toBeLessThanOrEqual(12);
    }
  });
});
