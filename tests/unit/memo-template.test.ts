import { describe, it, expect } from "vitest";
import { MEMO_TEMPLATE, formatMemoAnswer } from "@/lib/exercises/memo-extraction/template";

describe("MEMO_TEMPLATE", () => {
  it("mirrors the six required memo sections in order", () => {
    // Must match prompts/memo_extraction.generator.md's requiredAnswerSections,
    // which the evaluator's rubric is built around.
    expect(MEMO_TEMPLATE.map((s) => s.title)).toEqual([
      "Claim",
      "Evidence",
      "Assumptions",
      "Tradeoffs",
      "Next test",
      "What would change my mind"
    ]);
  });

  it("gives every section a guide", () => {
    for (const s of MEMO_TEMPLATE) expect(s.guide.trim().length).toBeGreaterThan(20);
  });
});

describe("formatMemoAnswer", () => {
  it("labels each section, trims answers and keeps template order", () => {
    const text = formatMemoAnswer(["  Ship it. ", "60 audits", "a", "b", "c", "d"]);
    expect(text).toBe(
      [
        "Claim:\nShip it.",
        "Evidence:\n60 audits",
        "Assumptions:\na",
        "Tradeoffs:\nb",
        "Next test:\nc",
        "What would change my mind:\nd"
      ].join("\n\n")
    );
  });

  it("marks empty or missing sections as blank so the grader scores them as missing", () => {
    const text = formatMemoAnswer(["Ship it.", "   "]);
    expect(text).toContain("Evidence:\n(blank)");
    expect(text).toContain("What would change my mind:\n(blank)");
  });
});
