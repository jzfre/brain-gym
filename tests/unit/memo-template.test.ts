import { describe, it, expect } from "vitest";
import { MEMO_TEMPLATE, formatMemoAnswer, memoSectionsFor } from "@/lib/exercises/memo-extraction/template";

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

describe("memoSectionsFor", () => {
  const section = (order: number, title: string, description: string | null = null) => ({
    order,
    title,
    description
  });

  it("uses the problem's own titles and order, with the matching generic guide", () => {
    const sections = memoSectionsFor([
      section(2, "Evidence", "Cite the memo's numbers."),
      section(1, "Claim")
    ]);
    expect(sections.map((s) => s.title)).toEqual(["Claim", "Evidence"]);
    expect(sections[0].guide).toBe(MEMO_TEMPLATE[0].guide);
    expect(sections[1].guide).toBe(MEMO_TEMPLATE[1].guide);
  });

  it("matches guides despite case and punctuation differences", () => {
    const [nextTest, tradeoffs] = memoSectionsFor([section(1, "Next Test"), section(2, "Trade-offs")]);
    expect(nextTest.guide).toBe(MEMO_TEMPLATE[4].guide);
    expect(tradeoffs.guide).toBe(MEMO_TEMPLATE[3].guide);
  });

  it("falls back to the generated description for a title the template doesn't know", () => {
    const [s] = memoSectionsFor([section(1, "Stakeholders", "Who is affected and how.")]);
    expect(s).toEqual({ title: "Stakeholders", guide: "Who is affected and how." });
  });

  it("falls back to the full template when the problem lists no sections", () => {
    expect(memoSectionsFor([])).toEqual(MEMO_TEMPLATE);
  });
});

describe("formatMemoAnswer", () => {
  it("labels each section, trims answers and keeps section order", () => {
    const text = formatMemoAnswer(MEMO_TEMPLATE, ["  Ship it. ", "60 audits", "a", "b", "c", "d"]);
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

  it("labels answers with the given sections, so they match the problem's own titles", () => {
    const sections = memoSectionsFor([
      { order: 1, title: "Thesis", description: null },
      { order: 2, title: "Evidence", description: null }
    ]);
    expect(formatMemoAnswer(sections, ["x", "y"])).toBe("Thesis:\nx\n\nEvidence:\ny");
  });

  it("marks empty or missing sections as blank so the grader scores them as missing", () => {
    const text = formatMemoAnswer(MEMO_TEMPLATE, ["Ship it.", "   "]);
    expect(text).toContain("Evidence:\n(blank)");
    expect(text).toContain("What would change my mind:\n(blank)");
  });
});
