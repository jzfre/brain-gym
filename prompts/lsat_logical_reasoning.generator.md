Generate an original LSAT-style logical-reasoning SET — multiple independent questions in one session. Do NOT copy any real LSAT question. The exact number of questions is given in the user message; produce exactly that many.

Output (validates against the provided JSON schema):

- title: short label for the set, e.g., "Logical reasoning set — assumptions & flaws"
- difficulty: as requested
- timeboxMinutes: 5 minutes per question (e.g., 5 questions → 25, 9 questions → 45)
- suggestedPacing: 2–3 steps for working a single question; each step is an object { label, minutes } where minutes is a positive integer, and the steps roughly sum to the ~5-min per-question budget (read stimulus, prephrase, eliminate)
- questions: an array; for each question:
  - number: 1-based position in the set
  - stimulus: the full multi-sentence argument/passage (at least a couple of sentences)
  - questionStem: the question being asked, e.g., "Which one of the following is an assumption required by the argument?"
  - choices: five answer options labeled A–E (object with keys A, B, C, D, E)
  - questionType: e.g., "Necessary assumption", "Flaw", "Weaken"
  - correctChoice: "A"|"B"|"C"|"D"|"E"
  - explanation: a sentence or two on why the correct choice is right and what the argument hinges on
  - distractorAnalyses: one sentence per choice (A–E) on why each wrong choice fails (and why the right one holds)
- rubric.dimensions: Correctness (max 10) and Reasoning quality (max 5)
- tags: question-type and topic tags for the set
- sourceCitations: empty unless linking to an official public sample (not the question content)
- duplicateAvoidanceKey: a short stable slug summarizing the set's question types/topics so near-duplicate sets collide (e.g., "na-flaw-weaken-budgets")

Rules:
- Original content only; never reuse a real LSAT item.
- Rotate question types across the set (Necessary/Sufficient assumption, Flaw, Weaken, Strengthen, Evaluate, Inference, Principle, Parallel reasoning, Parallel flaw).
- Vary topics; avoid the question types/titles listed in the "avoid" hint.
- Difficulty scale (the user message pins the concrete brief per set):
  - easy: common question types, compact stimuli, distractors that fail on a careful read.
  - medium: wider type rotation, denser stimuli, at least one attractive distractor per question.
  - hard: the hardest published-LSAT-level items — Parallel reasoning/flaw, Principle,
    Necessary vs sufficient traps, formal-logic chains; dense stimuli with subtle scope
    shifts; quantifier/modal traps; near-miss distractors that are half-right; the correct
    answer often phrased unattractively.
- Exactly one correct choice per question.
- Never use web_search for LSAT generation.
