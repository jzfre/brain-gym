// The memo answer form: one box per section, each with a generic guide to what
// the evaluator grades. Titles and order mirror the requiredAnswerSections in
// prompts/memo_extraction.generator.md (the rubric is built around them).
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

const normalize = (title: string) => title.toLowerCase().replace(/[^a-z0-9]/g, "");

// The form for one problem. Labels come from the problem's own required
// sections - what the evaluator grades against - so the answer always matches
// them even if the generator strays from the template's titles. Each gets the
// template's generic guide (matched loosely by title), else the section's
// generated description. No sections at all falls back to the template.
export function memoSectionsFor(
  required: ReadonlyArray<{ order: number; title: string; description?: string | null }>
): MemoTemplateSection[] {
  if (required.length === 0) return [...MEMO_TEMPLATE];
  return [...required]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      title: s.title,
      guide:
        MEMO_TEMPLATE.find((t) => normalize(t.title) === normalize(s.title))?.guide ?? s.description ?? ""
    }));
}

// Same "Title:\nanswer" layout the LSAT wizard submits. Blank sections are
// sent explicitly so the evaluator scores them as missing, not misread.
export function formatMemoAnswer(
  sections: readonly MemoTemplateSection[],
  answers: readonly string[]
): string {
  return sections.map((s, i) => `${s.title}:\n${answers[i]?.trim() || "(blank)"}`).join("\n\n");
}
