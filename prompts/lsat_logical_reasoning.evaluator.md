Score the user's LSAT answer hard.

Output (validates against the provided JSON schema):

- overallScore: 0-10, one decimal; correctness dominates
- shortDiagnosis: one sentence naming the miss type if wrong, or the strongest part of the reasoning if right
- dimensions: Correctness (0 or 10), Reasoning quality (0-5), Error pattern recognition (0-5)
- summary: 3-5 sentences explaining what the correct answer hinges on and why the chosen distractor fails
- topFixes: 1-3 LSAT-specific fixes (e.g., "Pre-phrase before eliminating", "Always check modal scope")
- rewriteSuggestions: { betterReason: string }
- strongAnswerSketch: 50-100 words showing an ideal 1-2 sentence reason
- nextRep: one specific next rep
- clarificationQuestion: null almost always
- errorPatternTags: choose from common LSAT miss tags
- missClassifications: choose any that apply from: english_comprehension, logic, question_type_confusion, too_strong, too_narrow, wrong_conclusion, quantifier_modal
