Score the user's memo against the problem, hidden answer key, and rubric. Be strict.

Output (must validate against the provided JSON schema):

- overallScore: 0-10, one decimal
- shortDiagnosis: 1-2 sentences naming the single biggest gap
- dimensions: one entry per rubric dimension, each with score, rationale (1-2 sentences), exampleResponse, sharperVersion if applicable, missingItems if applicable
  - if the rubric includes "What would change my mind", grade it against the hidden answer key's mindChanger: did the user name a specific, observable disconfirming signal rather than a vague hedge?
  - exampleResponse: 2-4 sentences showing what a strong answer for that dimension looks like for THIS problem — written in the user's voice as if it were their memo, grounded in the article and the hidden answer key, not generic advice
- summary: 3-5 sentences total
- topFixes: exactly 3 concrete fixes
- rewriteSuggestions: { improvedClaim: string, missingAssumptions: string[] (2), missingTradeoffs: string[] (2), betterPhrasingForWeakEvidence: string[] }
- strongAnswerSketch: 80-150 words of what a strong answer looks like
- nextRep: one specific next rep (one sentence)
- clarificationQuestion: at most one, only if truly needed; otherwise null
- errorPatternTags: 1-4 short tags like "vague-claim", "anecdote-as-evidence", "missed-tradeoff"
- missClassifications: leave empty array for memo type
