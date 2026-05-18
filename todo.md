# TODO

Ideas for making Brain Gym better, roughly ranked by what I'd do next.

## Make the training tighter (most aligned with the spec)

- [ ] **Weekly review (spec Phase 6)** — Saturday view that aggregates the week by dimension, flags recurring weakness, sets next week's focus. Highest practical value.
- [ ] **Score-trend analytics** — per-dimension lines over time so you can see whether you're improving. The point of structured rubrics is comparability across weeks.
- [ ] **Calibration set** — commit 3 sample answers per mode (bad / medium / strong) and run them through the evaluator after any prompt edit. Catches scoring drift in 30 seconds.
- [ ] **pgvector semantic memory (Phase 7)** — current dedup only catches exact hash collisions. Embeddings would catch "feels different but tests the same skill."

## UX that affects daily friction

- [ ] **Markdown rendering** in problem text and feedback — model emits markdown but we render `whitespace-pre-wrap`. `react-markdown` would make incidents/memos much more readable.
- [ ] **Streaming the generation response** — generate can take 60s with web search; streaming tokens makes it feel alive instead of frozen.
- [ ] **Auto-save draft to localStorage** — accidental browser refresh mid-answer currently nukes your work.
- [ ] **Retry-evaluation button** on `EVAL_FAILED` history rows — spec calls for it, UI doesn't expose it.
- [ ] **Cmd+Enter to submit** — small but matters for daily use.

## Operational visibility

- [ ] **Cost / token dashboard** — `model_runs.usagePayload` already has the data; surface "today: X tokens, $Y" on Admin so OpenAI bills don't surprise.
- [ ] **Streak counter** — minimal gamification, one number, days in a row.

## Deploy (deferred)

- [ ] **Pick deployment target** — Vercel + Neon, Cloudflare Tunnel against this box, Fly/Railway, or a VPS with Caddy + Let's Encrypt.
- [ ] **HTTPS before going public** — password is currently sent in cleartext over HTTP.
- [ ] **Lock down Docker Postgres** — bind port 5438 to 127.0.0.1, not 0.0.0.0, before exposing the host.
