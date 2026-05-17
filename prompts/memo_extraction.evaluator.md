Score the user's memo against the problem, hidden answer key, and rubric. Be strict.

Output (must validate against the provided JSON schema):

- overallScore: 0-10, one decimal
- shortDiagnosis: 1-2 sentences naming the single biggest gap
- dimensions: one entry per rubric dimension, each with score, rationale (1-2 sentences), sharperVersion if applicable, missingItems if applicable
- summary: 3-5 sentences total
- topFixes: exactly 3 concrete fixes
- rewriteSuggestions: { improvedClaim: string, missingAssumptions: string[] (2), missingTradeoffs: string[] (2), betterPhrasingForWeakEvidence: string[] }
- strongAnswerSketch: 80-150 words of what a strong answer looks like
- nextRep: one specific next rep (one sentence)
- clarificationQuestion: at most one, only if truly needed; otherwise null
- errorPatternTags: 1-4 short tags like "vague-claim", "anecdote-as-evidence", "missed-tradeoff"
- missClassifications: leave empty array for memo type
