import { describe, expect, it, vi } from "vitest";
import {
  createQualityReport,
  runQualityReport,
  blindQuestions,
  reviewKey,
  KeyReviewSchema,
  KEY_REVIEW_PROMPT,
  type QualityOptions,
  type QualityProvider,
  type QualityRequest,
  type QualityReport
} from "./quality-runner";
import { rubricLiveCases, lsatLiveCases } from "./live-fixtures";
import { workflowFixtures } from "./workflow-fixtures";

const options: QualityOptions = {
  model: "generator-test",
  reviewerModel: "reviewer-test",
  reasoningEffort: "medium",
  repeats: 1,
  includeGeneration: false,
  maxOutputTokens: 12000
};
const prompts = {
  base: "Base",
  memo_extraction: "Memo",
  incident_response: "Incident",
  lsat_logical_reasoning: "LSAT",
  lsat_generator: "Generate"
};
const newReport = (overrides: Partial<QualityOptions> = {}) =>
  createQualityReport({ ...options, ...overrides }, prompts, "test-revision");

function outputFor(request: QualityRequest): unknown {
  if (request.input[0].content === KEY_REVIEW_PROMPT) {
    const { questions } = JSON.parse(request.input[1].content) as {
      questions: Array<{ number: number }>;
    };
    return {
      questions: questions.map(({ number }) => ({
        number,
        bestChoice: "B",
        plausibleChoices: ["B"],
        ambiguous: false,
        explanation:
          "The premise asserts a sufficient condition but the conclusion treats it as necessary."
      }))
    };
  }
  const content = request.input[request.input.length - 1].content;
  if (content.startsWith("Generate"))
    return structuredClone(workflowFixtures.LSAT_LOGICAL_REASONING.generated);
  const payload = JSON.parse(content);
  if (payload.userAnswer) {
    const fixture = rubricLiveCases.find((item) => item.answer === payload.userAnswer)!;
    const evaluation = structuredClone(
      fixture.mode === "memo_extraction"
        ? workflowFixtures.MEMO_EXTRACTION.evaluation
        : workflowFixtures.INCIDENT_RESPONSE.evaluation
    );
    const score = fixture.minScore;
    evaluation.dimensions.forEach((dimension) => {
      dimension.score = score;
    });
    evaluation.overallScore = score;
    return evaluation;
  }
  const evaluation = structuredClone(workflowFixtures.LSAT_LOGICAL_REASONING.evaluation);
  return {
    ...evaluation,
    questions: [
      {
        ...evaluation.questions[0],
        missClassification: payload.questions[0].userChoice === "B" ? null : "logic"
      }
    ]
  };
}
const validProvider: QualityProvider = async (request) => ({
  id: "response-id",
  model: request.model,
  status: "completed",
  text: JSON.stringify(outputFor(request)),
  usage: { input_tokens: 10, output_tokens: 20 }
});

// The provider is intentionally offline. These check the reporting/gating engine,
// not whether any live model can pass the cases.
describe("reproducible quality reports", () => {
  it("dry-run plans spending without claiming a pass or producing model evidence", () => {
    const report = newReport();
    expect(report.status).toBe("planned");
    expect(report.calls).toEqual([]);
    expect(report.results).toEqual([]);
    expect(report.maxCalls).toBe(6);
    expect(report.prompts.base.content).toBe("Base");
    expect(report.prompts.base.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(newReport().fixtureHash).toBe(report.fixtureHash);
  });

  it("persists per-call evidence and accounts for repeated runs", async () => {
    const provider = vi.fn(validProvider);
    const snapshots: QualityReport[] = [];
    const report = await runQualityReport(newReport({ repeats: 2 }), provider, async (current) => {
      snapshots.push(JSON.parse(JSON.stringify(current)));
    });
    expect(provider).toHaveBeenCalledTimes(12);
    expect(report.status).toBe("passed");
    expect(report.summary).toMatchObject({
      completedCalls: 12,
      failedCalls: 0,
      inputTokens: 120,
      outputTokens: 240,
      callsWithoutUsage: 0
    });
    expect(report.summary.byCase["memo-strong"]).toMatchObject({
      runs: 2,
      passed: 2,
      passRate: 1,
      meanScore: 7
    });
    expect(report.calls[0]).toMatchObject({
      response: { id: "response-id", model: "generator-test" }
    });
    expect(report.calls[0].parsed).toBeTruthy();
    expect(report.calls[0].schemaHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      snapshots.some((snapshot) => snapshot.calls.some((call) => call.status === "running"))
    ).toBe(true);
    expect(snapshots.at(-1)?.status).toBe("passed");
  });

  it("counts billable tokens on incomplete/schema-invalid responses and never retries", async () => {
    const provider = vi
      .fn(validProvider)
      .mockResolvedValueOnce({
        status: "incomplete",
        text: "partial",
        usage: { input_tokens: 100, output_tokens: 200 }
      })
      .mockResolvedValueOnce({
        status: "completed",
        text: '{"wrong":"schema"}',
        usage: { input_tokens: 50, output_tokens: 60 }
      });
    const report = await runQualityReport(newReport(), provider, async () => {});
    expect(provider).toHaveBeenCalledTimes(6);
    expect(report.status).toBe("failed");
    expect(report.summary).toMatchObject({
      failedCalls: 2,
      inputTokens: 190,
      outputTokens: 340,
      callsWithoutUsage: 0
    });
    expect(report.calls[0].response?.text).toBe("partial");
    expect(report.calls[1].response?.text).toBe('{"wrong":"schema"}');
  });

  it("distinguishes missing token usage from zero-cost failures and redacts API keys", async () => {
    const provider = vi
      .fn(validProvider)
      .mockRejectedValueOnce(new Error("Bad credential sk-sensitive_secret_123"));
    const report = await runQualityReport(newReport(), provider, async () => {});
    expect(report.summary.callsWithoutUsage).toBe(1);
    expect(report.status).toBe("failed");
    expect(JSON.stringify(report)).not.toContain("sk-sensitive");
    expect(report.calls[0].error?.kind).toBe("transport");
  });

  it("does not spend tokens if initial report persistence fails", async () => {
    const provider = vi.fn(validProvider);
    await expect(
      runQualityReport(newReport(), provider, async () => {
        throw new Error("disk full");
      })
    ).rejects.toThrow("disk full");
    expect(provider).not.toHaveBeenCalled();
  });

  it("enforces repeat bounds and cannot execute a completed report twice", async () => {
    expect(() => newReport({ repeats: 0 })).toThrow();
    expect(() => newReport({ repeats: 6 })).toThrow();
    const provider = vi.fn(validProvider);
    const report = await runQualityReport(newReport(), provider, async () => {});
    await expect(runQualityReport(report, provider, async () => {})).rejects.toThrow(
      "only execute once"
    );
    expect(provider).toHaveBeenCalledTimes(6);
  });
});

describe("independent LSAT key challenge", () => {
  it("never supplies the generator key, explanation or critique to the blind reviewer", () => {
    const source = workflowFixtures.LSAT_LOGICAL_REASONING.generated.questions;
    const serialized = JSON.stringify(blindQuestions(source));
    expect(serialized).not.toContain("correctChoice");
    expect(serialized).not.toContain("explanation");
    expect(serialized).not.toContain("distractorAnalyses");
    expect(blindQuestions(source)[0].stimulus).toBe(source[0].stimulus);
  });

  it("rejects a logically wrong supplied key even when it is schema-valid", () => {
    const review = KeyReviewSchema.parse({
      questions: [
        {
          number: 1,
          bestChoice: "B",
          plausibleChoices: ["B"],
          ambiguous: false,
          explanation: "Wetness does not prove cleaning because rain is another sufficient cause."
        }
      ]
    });
    expect(reviewKey([{ number: 1, correctChoice: "A" }], review)).toContain(
      "Question 1: reviewer chose B, supplied key chose A"
    );
    expect(reviewKey([{ number: 1, correctChoice: "B" }], review)).toEqual([]);
  });

  it("runs calibration then generation and blind review as separate calls", async () => {
    const provider = vi.fn(validProvider);
    const report = await runQualityReport(
      newReport({ includeGeneration: true }),
      provider,
      async () => {}
    );
    expect(report.maxCalls).toBe(9);
    expect(provider).toHaveBeenCalledTimes(9);
    expect(report.status).toBe("passed");
    expect(provider.mock.calls[6][0].model).toBe("reviewer-test");
    expect(provider.mock.calls[7][0].model).toBe("generator-test");
    expect(provider.mock.calls[8][0].model).toBe("reviewer-test");
    expect(provider.mock.calls[8][0].input[1].content).not.toContain("correctChoice");
  });

  it("fails a schema-valid generated key when the blind reviewer disagrees", async () => {
    const provider = vi.fn(async (request: QualityRequest) => {
      const response = await validProvider(request);
      if (request.input.at(-1)?.content.startsWith("Generate")) {
        const generated = JSON.parse(response.text);
        generated.questions[0].correctChoice = "A";
        response.text = JSON.stringify(generated);
      }
      return response;
    });
    const report = await runQualityReport(
      newReport({ includeGeneration: true }),
      provider,
      async () => {}
    );
    expect(report.status).toBe("failed");
    expect(report.results.at(-1)).toMatchObject({
      id: "lsat-generated-key-review",
      status: "failed"
    });
    expect(report.results.at(-1)?.checks.join(" ")).toContain(
      "reviewer chose B, supplied key chose A"
    );
  });

  it("skips generation spend if the reviewer cannot solve a known control", async () => {
    const provider = vi.fn(async (request: QualityRequest) => {
      if (request.input[0].content === KEY_REVIEW_PROMPT)
        return {
          status: "completed",
          text: JSON.stringify({
            questions: [
              {
                number: 1,
                bestChoice: "A",
                plausibleChoices: ["A"],
                ambiguous: false,
                explanation: "Incorrectly claims another street invalidates the inference."
              }
            ]
          })
        };
      return validProvider(request);
    });
    const report = await runQualityReport(
      newReport({ includeGeneration: true }),
      provider,
      async () => {}
    );
    expect(provider).toHaveBeenCalledTimes(7);
    expect(report.status).toBe("failed");
    expect(report.results.filter((result) => result.status === "skipped")).toHaveLength(2);
  });

  it("rejects reviewer omissions, duplicate IDs, ambiguity and multiple defensible choices", () => {
    const valid = {
      number: 1,
      bestChoice: "B" as const,
      plausibleChoices: ["B" as const],
      ambiguous: false,
      explanation: "A sufficiently detailed explanation of the correct choice."
    };
    expect(
      reviewKey([{ number: 1, correctChoice: "B" }], { questions: [valid, valid] }).length
    ).toBeGreaterThan(0);
    expect(
      reviewKey(
        [
          { number: 1, correctChoice: "B" },
          { number: 2, correctChoice: "A" }
        ],
        { questions: [valid] }
      ).length
    ).toBeGreaterThan(0);
    expect(
      reviewKey([{ number: 1, correctChoice: "B" }], {
        questions: [{ ...valid, ambiguous: true, plausibleChoices: ["B", "C"] }]
      }).length
    ).toBeGreaterThan(0);
    expect(lsatLiveCases[0].payload.questions[0].correctChoice).toBe("B");
  });
});
