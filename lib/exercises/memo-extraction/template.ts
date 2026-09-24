// The memo answer form: one box per section, each with a generic guide to what
// the evaluator grades. Titles and order must match the requiredAnswerSections
// in prompts/memo_extraction.generator.md (the rubric is built around them).
export type MemoTemplateSection = { title: string; guide: string };

export const MEMO_TEMPLATE: readonly MemoTemplateSection[] = [
  {
    title: "Claim",
    guide:
      "One sentence: the core claim or recommendation — the exact change, its scope and its time bound. Your own words, not a quote."
  },
  {
    title: "Evidence",
    guide: "Facts from the memo only. Use the numbers. What actually happened, not what's assumed."
  },
  {
    title: "Assumptions",
    guide:
      "What must be true for the claim to hold. Distinct from evidence — these are the unproven bets it rests on."
  },
  {
    title: "Tradeoffs",
    guide:
      "Both sides in one place: the give and the get. Include what cuts against the claim and the cost of being wrong."
  },
  {
    title: "Next test",
    guide:
      "The sharpest, cheapest test before committing: what you'd measure, against what baseline, over what period."
  },
  {
    title: "What would change my mind",
    guide:
      "Specific, observable signals that would reverse the decision. Concrete thresholds, not a hedge."
  }
];

// Same "Title:\nanswer" layout the LSAT wizard submits. Blank sections are
// sent explicitly so the evaluator scores them as missing, not misread.
export function formatMemoAnswer(answers: readonly string[]): string {
  return MEMO_TEMPLATE.map((s, i) => `${s.title}:\n${answers[i]?.trim() || "(blank)"}`).join("\n\n");
}
