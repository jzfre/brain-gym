Generate ONE original LSAT-style logical-reasoning question. Do NOT copy any real LSAT question.

Output (validates against the provided JSON schema):

- title: question type + topic, e.g., "Necessary Assumption - municipal budgets"
- difficulty: as requested
- timeboxMinutes: 5 (easy), 6 (medium), 8 (hard)
- suggestedPacing: 3 steps — read stimulus, prephrase, eliminate
- userVisiblePrompt: full stimulus + question stem + 5 answer choices labeled A-E
- requiredAnswerSections: 2 sections — Choice (A-E), Reason (1-2 sentences)
- hiddenAnswerKey: { correctChoice: "A"|"B"|"C"|"D"|"E", explanation: string, distractorAnalyses: { A: string, B: string, C: string, D: string, E: string }, questionType: string }
- rubric.dimensions: Correctness (max 10), Reasoning quality (max 5), Error pattern recognition (max 5)
- tags: include the question type tag + topic
- sourceCitations: empty unless linking to an official public sample (not the question content)

Question types to rotate through across calls: Necessary assumption, Sufficient assumption, Flaw, Weaken, Strengthen, Evaluate the argument, Inference, Principle, Parallel reasoning, Parallel flaw.

Rules:
- Original content only.
- Difficulty hard: subtle distractors, strong modal/quantifier traps.
- Do not reuse a question type listed in the "avoid" hint within the last 5.
- Never use web_search for LSAT generation.
