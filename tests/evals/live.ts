/** Explicit opt-in only: credentials are never read by the offline unit suites. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import OpenAI from "openai";
import type { ReasoningEffort } from "openai/resources/shared";
import { Agent } from "undici";
import { z } from "zod";
import {
  createQualityReport,
  runQualityReport,
  type QualityProvider,
  type QualityReport
} from "./quality-runner";

async function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean" },
      help: { type: "boolean" },
      repeats: { type: "string", default: "1" },
      "lsat-generation": { type: "boolean" },
      output: { type: "string" }
    }
  });
  if (values.help) {
    console.log(
      "Usage: pnpm eval:live [--dry-run] [--repeats 1..5] [--lsat-generation] [--output report.json]\nDefault: six billable calls per repeat; --lsat-generation adds up to three (blind reviewer calibration, generation, blind key review). No automatic retries. Reports are saved under artifacts/model-evals. Dry-run never calls the provider and reports status=planned, not passed.\nLive environment: OPENAI_API_KEY, OPENAI_MODEL; optional EVAL_REVIEW_MODEL, OPENAI_REASONING_EFFORT, OPENAI_EVAL_TIMEOUT_MS, EVAL_MAX_OUTPUT_TOKENS."
    );
    return;
  }
  const repeats = z.coerce.number().int().min(1).max(5).parse(values.repeats);
  const dryRun = values["dry-run"] ?? false;
  const settingSchema = z.object({
    OPENAI_MODEL: z.string().min(1),
    EVAL_REVIEW_MODEL: z.string().min(1).optional(),
    OPENAI_REASONING_EFFORT: z
      .enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"])
      .default("medium"),
    OPENAI_EVAL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(1_200_000).default(600_000),
    EVAL_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(32_000).default(12_000)
  });
  const settings = settingSchema.parse({
    ...process.env,
    OPENAI_MODEL: process.env.OPENAI_MODEL ?? (dryRun ? "unconfigured-dry-run" : undefined)
  });
  // Fail before opening a live report or spending tokens; never print the key.
  const apiKey = dryRun
    ? null
    : z
        .string()
        .min(1, "OPENAI_API_KEY is required for live evaluations")
        .parse(process.env.OPENAI_API_KEY);
  const names = {
    base: "base.md",
    memo_extraction: "memo_extraction.evaluator.md",
    incident_response: "incident_response.evaluator.md",
    lsat_logical_reasoning: "lsat_logical_reasoning.evaluator.md",
    lsat_generator: "lsat_logical_reasoning.generator.md"
  };
  const prompts = Object.fromEntries(
    await Promise.all(
      Object.entries(names).map(async ([name, file]) => [
        name,
        await readFile(new URL(`../../prompts/${file}`, import.meta.url), "utf8")
      ])
    )
  );
  let revision: string | null = null;
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    /* source snapshots still identify the run */
  }
  const report = createQualityReport(
    {
      model: settings.OPENAI_MODEL,
      reviewerModel: settings.EVAL_REVIEW_MODEL ?? settings.OPENAI_MODEL,
      reasoningEffort: settings.OPENAI_REASONING_EFFORT,
      repeats,
      includeGeneration: values["lsat-generation"] ?? false,
      maxOutputTokens: settings.EVAL_MAX_OUTPUT_TOKENS
    },
    prompts,
    revision
  );
  const reportPath = resolve(
    values.output ??
      `artifacts/model-evals/${report.startedAt.replace(/[:.]/g, "-")}-${report.runId}.json`
  );
  await mkdir(dirname(reportPath), { recursive: true, mode: 0o700 });
  let initialized = false;
  async function persist(snapshot: QualityReport) {
    const content = JSON.stringify(snapshot, null, 2) + "\n";
    if (!initialized) {
      await writeFile(reportPath, content, { flag: "wx", mode: 0o600 });
      initialized = true;
      return;
    }
    const temporary = `${reportPath}.${report.runId}.tmp`;
    try {
      await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
      await rename(temporary, reportPath);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  if (dryRun) {
    await persist(report);
    console.log(
      JSON.stringify(
        {
          status: report.status,
          maxLiveCalls: report.maxCalls,
          cases: report.plannedCases,
          reportPath
        },
        null,
        2
      )
    );
    return;
  }
  const dispatcher = new Agent({
    headersTimeout: settings.OPENAI_EVAL_TIMEOUT_MS,
    bodyTimeout: settings.OPENAI_EVAL_TIMEOUT_MS
  });
  const client = new OpenAI({
    apiKey: apiKey!,
    timeout: settings.OPENAI_EVAL_TIMEOUT_MS,
    maxRetries: 0,
    fetchOptions: { dispatcher }
  });
  const provider: QualityProvider = async (request) => {
    try {
      // Use create rather than parse so incomplete/refused/malformed responses
      // retain their raw output and billable usage before local validation.
      const response = await client.responses.create({
        model: request.model,
        reasoning: { effort: request.reasoningEffort as ReasoningEffort },
        input: request.input,
        max_output_tokens: request.maxOutputTokens,
        text: { format: request.format }
      });
      return {
        id: response.id,
        model: response.model,
        status: response.status ?? "unknown",
        text: response.output_text,
        usage: response.usage
          ? {
              input_tokens: response.usage.input_tokens,
              output_tokens: response.usage.output_tokens
            }
          : undefined,
        raw: response
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(apiKey ? message.replaceAll(apiKey, "[REDACTED]") : message);
    }
  };
  try {
    await runQualityReport(report, provider, persist);
    console.log(
      JSON.stringify(
        { status: report.status, model: settings.OPENAI_MODEL, reportPath, ...report.summary },
        null,
        2
      )
    );
    if (report.status !== "passed") process.exitCode = 1;
  } finally {
    await dispatcher.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Live evaluation failed");
  process.exitCode = 1;
});
