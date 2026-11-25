# TODO

Ideas for making Brain Gym better, roughly ranked by what I'd do next.

## Make the training tighter (most aligned with the spec)

- [ ] **Weekly review (spec Phase 6)** — Saturday view that aggregates the week by dimension, flags recurring weakness, sets next week's focus. Highest practical value.
- [ ] **Score-trend analytics** — per-dimension lines over time so you can see whether you're improving. The point of structured rubrics is comparability across weeks.
- [ ] **Calibration set** — commit 3 sample answers per mode (bad / medium / strong) and run them through the evaluator after any prompt edit. Catches scoring drift in 30 seconds.
- [x] **pgvector semantic memory (Phase 7)** — semantic neighbors plus exact-content retry protection are implemented; validated against PostgreSQL/pgvector.

## UX that affects daily friction

- [ ] **Markdown rendering** in problem text and feedback — model emits markdown but we render `whitespace-pre-wrap`. `react-markdown` would make incidents/memos much more readable.
- [ ] **Streaming the generation response** — generate can take 60s with web search; streaming tokens makes it feel alive instead of frozen.
- [x] **Auto-save draft to localStorage** — memo/incident/LSAT answers, position, timer, and submission ID survive reload and reauthentication.
- [x] **Retry-evaluation button** — failed/interrupted attempts can be retried from saved History details.
- [ ] **Cmd+Enter to submit** — small but matters for daily use.

## Operational visibility

- [ ] **Cost / token dashboard** — `model_runs.usagePayload` already has the data; surface "today: X tokens, $Y" on Admin so OpenAI bills don't surprise.
- [ ] **Streak counter** — minimal gamification, one number, days in a row.

## Deployment

- [x] **Deployment layout** — Rocinante uses one long-lived Node process and PostgreSQL; see `docs/operations.md`.
- [x] **HTTPS requirement** — production cookies are Secure; HTTPS proxy setup is documented. Recheck the host after deployment.
- [x] **Loopback bindings** — portable Compose binds app and PostgreSQL to 127.0.0.1; preserve the private host Compose settings.

See `docs/reliability-review.md` for the current verification record and remaining reliability/model-quality limitations.
