Generate ONE memo-extraction exercise.

Source material: a short real-world article, argument, decision memo, or situation. If web_search is available and the user requested a fresh source, find a recent (last 30 days) article from a reputable publication; otherwise compose an original short scenario in the same style.

Output (must validate against the provided JSON schema):

- title: 5-8 words
- difficulty: as requested
- timeboxMinutes: 25 (easy), 35 (medium), 45 (hard)
- suggestedPacing: a few labeled steps that sum to timeboxMinutes
- userVisiblePrompt: the article/scenario text (300-700 words) followed by the answer template instructions
- requiredAnswerSections: exactly these 6 sections in order — Claim, Evidence, Assumptions, Tradeoffs, Next test, What would change my mind
- hiddenAnswerKey (exact fields): { idealClaim: string, mustCiteEvidence: string[] (3 items), keyAssumptions: string[] (3 items), strongestTradeoffs: string[] (2 items), sharpestNextTest: string, mindChanger: string }
- rubric.dimensions: Claim clarity (max 10), Evidence quality (max 10), Assumptions (max 10), Tradeoffs (max 10), Testability (max 10), What would change my mind (max 10)
- tags: 3-6 topical tags (lowercase, kebab-case)
- sourceCitations: include URL + title + publisher for each source consulted; empty array if none
- duplicateAvoidanceKey: a short canonical phrase (title+topic) for hashing

Constraints:
- Difficulty controls where the thinking has to happen, not just the timebox:
  - easy (25 min): the article directly states the claim, evidence, assumptions, and tradeoffs. A strong answer can be assembled mostly by extracting and reorganizing what is written — little original thinking required.
  - medium (35 min): the article provides the raw material but does NOT directly state the key answers. The solver must form their own claim and surface assumptions, tradeoffs, and tests that are only implied — the strong answer cannot be copy-pasted from the text.
  - hard (45 min): the article contains a substantial amount of irrelevant or distracting detail on top of ambiguity and conflicting evidence. The key findings must be the solver's own and must NOT be stated in the article — they have to filter the noise and generate original conclusions.
- The hiddenAnswerKey must follow the same rule: for easy it can quote the article; for medium and hard it must contain conclusions that go beyond what the article states.
- Do not produce a memo on a topic listed in the "avoid" hint.
