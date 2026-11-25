# Live model quality evaluations

No live model calls have been completed in this workspace: neither an API key nor
a model is configured. The offline harness and dry-run are tested; that is not
evidence that a production model passes these quality gates.

## Run a bounded evaluation

```bash
# No provider calls; writes a report whose status is "planned".
pnpm eval:live --dry-run

# Set OPENAI_API_KEY and OPENAI_MODEL in the environment or .env.
pnpm eval:live

# Assess repeatability and independently challenge newly generated LSAT keys.
# EVAL_REVIEW_MODEL may name a different available model for the blind solver.
pnpm eval:live --lsat-generation --repeats 3
```

The default suite makes six calls per repeat. `--lsat-generation` adds at most
three per repeat. Repeats are limited to 1–5, calls are sequential, and there are
no automatic provider retries. Failed reviewer calibration skips the subsequent
generation and review calls. The CLI prints the exact call ceiling in dry-run.

Optional settings:

| Setting | Default | Purpose |
| --- | --- | --- |
| `EVAL_REVIEW_MODEL` | `OPENAI_MODEL` | Model used for the separate blind key review |
| `OPENAI_REASONING_EFFORT` | `medium` | Requested reasoning effort for each call |
| `OPENAI_EVAL_TIMEOUT_MS` | `600000` | Per-call deadline, capped at 20 minutes |
| `EVAL_MAX_OUTPUT_TOKENS` | `12000` | Per-call output budget, bounded to 256–32000 |
| `--output path.json` | New file under `artifacts/model-evals/` | Report destination; existing files are rejected |

Reports contain synthetic exercise inputs and outputs. They are written with
owner-only permissions and updated atomically before and after calls. An
interrupted run remains `running`; it is never converted into a passing result.
No application database is read or written. The runner loads repository prompt
files, which may differ from active prompt versions in a deployed database.

## What the gates check

The six default cases cover strong and weak memo/incident answers, an attempted
grading override, and correct/incorrect LSAT reasoning. Memo and incident scores
use the same deterministic normalized rubric total as the app. Strong answers
must score at least 7; weak answers at most 3. These initial bands require human
calibration. LSAT feedback must cover the submitted question and classify a miss
consistently with the objective answer key.

The optional generation checks add:

1. **Blind reviewer calibration.** The reviewer solves a known converse-flaw
   question without seeing its key. The harness compares that independent answer
   with both the known correct key and a deliberately incorrect key. A reviewer
   that cannot detect the wrong key does not proceed to generation.
2. **Generation.** Generate five original EASY questions using the repository
   generator prompt. Enforce the real generated-problem schema, plus the requested
   question count and numbering.
3. **Blind key review.** A fresh call receives only stimuli, question stems and
   options. It never receives generated keys, explanations, distractor analyses,
   or learner answers. The harness then compares its answers with the withheld
   keys. Missing/duplicate reviews, ambiguity, multiple defensible choices, and
   key disagreements fail the run.

A separate call avoids handing the answer to its judge. Using the same model for
generation and review still allows correlated errors; selecting another reviewer
model can provide another perspective but does not establish truth. Agreement
is a screening result, not proof. A disagreement requires human review of the
question and both explanations; never automatically change the answer key to
whatever the reviewer selected.

## Inspect and compare evidence

The report includes prompt snapshots and hashes, JSON-schema snapshots and
hashes, fixture hash, source revision, requested and actual models, effort,
per-call input/output, provider response IDs, latency, and token usage. Repeated
runs include per-case pass rates and score ranges/means. All observed cases must
pass for the run to pass; skipped cases prevent a pass.

Usage is recorded before parsing the output so incomplete or malformed responses
still count. Transport failures with no provider usage are explicitly counted as
`callsWithoutUsage`; token totals are therefore known usage, not an assertion
that other calls cost nothing. The runner does not estimate currency costs.

Before comparing runs, verify matching fixture/schema/prompt hashes, reasoning
effort and case selection. Preserve both reports. Review the raw outputs, not
just the aggregate pass flag. For a changed prompt or model, repeat the suite,
inspect every disagreement and a sample of passing items, and record reviewer
judgments next to the reports. Threshold changes should come from reviewed
examples rather than tuning until a particular run passes.

These checks do not establish memo source accuracy, incident realism, broad
prompt-injection resistance, or full difficulty calibration. The current live
generation review is limited to LSAT. Source verification and expert review of
memo/incident outputs remain manual gates.
