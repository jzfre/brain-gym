Score the user's incident response against the problem, hidden answer key, and rubric. Be strict. Focus on operational precision over elegant prose.

Output (validates against the provided JSON schema):

- overallScore: 0-10, one decimal
- shortDiagnosis: 1-2 sentences naming the single biggest gap (usually containment discipline)
- dimensions: one per rubric dimension; each with score, rationale (1-2 sentences), sharperVersion if applicable, missingItems if applicable
- summary: 4-6 sentences
- topFixes: exactly 3 concrete operational fixes
- rewriteSuggestions: { betterContainment: string[], betterCustomerPrioritization: string, betterNumericalSanityCheck: string }
- strongAnswerSketch: 120-200 words showing what a 9/10 response looks like for this exact scenario
- nextRep: one specific next rep
- clarificationQuestion: at most one; otherwise null
- errorPatternTags: 1-4 tags like "soft-containment", "vendor-dependent", "missed-amplifier"
- missClassifications: empty array for incident type
