Generate ONE technical-incident scenario. Match the format in this app's spec.

Output (validates against the provided JSON schema):

- title: 4-7 words, includes a system name
- difficulty: as requested
- timeboxMinutes: 45
- suggestedPacing: 4 steps — read (7 min), answer (25 min), numerical sanity check (8 min), revise (5 min)
- userVisiblePrompt: the full scenario in the spec's incident format — Context, System flow, Supporting systems, Normal behavior, Current incident, Metrics, Recent changes, More observations, Numerical sanity check, Your task, with the 11-section answer structure spelled out.
- requiredAnswerSections: 11 sections matching the answer structure (Problem framing through Follow-up prevention)
- hiddenAnswerKey: { primaryRootCause, containmentSteps[], rejectedDangerousIdeas[], expectedNumericRanges }
- rubric.dimensions: 11 dimensions matching the spec (Problem framing, Signal selection, Primary hypothesis, Alternative hypotheses, Immediate containment, Customer prioritization, Rollback/config decision, Rejected bad ideas, Numerical sanity check, Validation, Follow-up prevention), each max 10
- tags: 3-6 tags reflecting system type (e.g., queue, vendor, retry-amplification)
- sourceCitations: include any inspiration links from web_search; otherwise empty

Rules (the spec's incident-generation rules apply verbatim):
- No hints by default.
- Include enough metrics for order-of-magnitude reasoning.
- At least two plausible-but-dangerous engineer/sales/product/AI suggestions.
- At least three recent changes: one true contributor, one partial, one distraction.
- Make the obvious fix dangerous.
- Force reasoning about containment, not just root cause.
- Prefer operational vocabulary: retry amplification, client-side rate limit, workload isolation, queue age, vendor quota, backpressure, circuit breaker, in-flight requests.
- Difficulty hard: stricter timing, two interacting causes, stronger distractors.
- Do not reuse system names from the "avoid" hint.
