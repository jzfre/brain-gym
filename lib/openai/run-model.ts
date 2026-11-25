import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z, ZodType } from "zod";
import { ModelRunPurpose, ModelRunStatus, type Prisma } from "@prisma/client";
import type { ReasoningEffort } from "@/lib/config";
import { retryDatabaseOperation } from "@/lib/db/retry";
import { prisma } from "@/lib/db/client";
import { jobContext } from "@/lib/jobs/context";
import { withJobLease } from "@/lib/jobs/store";
import { getOpenAI } from "./client";

export type WebSearchTool = { type: "web_search" };
export type RunStructuredArgs<S extends ZodType> = {
  purpose: ModelRunPurpose;
  model: string;
  input: string | Array<{ role: "system" | "user" | "developer"; content: string }>;
  schema: S;
  schemaName: string;
  reasoningEffort?: ReasoningEffort;
  tools?: WebSearchTool[];
  client?: Pick<OpenAI, "responses">;
  timeoutMs?: number;
};
export type RunStructuredResult<S extends ZodType> = {
  parsed: z.infer<S>;
  modelRunId: string;
  rawResponse: unknown;
};
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export async function runStructured<S extends ZodType>(
  args: RunStructuredArgs<S>
): Promise<RunStructuredResult<S>> {
  const context = jobContext.getStore();
  context?.signal.throwIfAborted();
  const step = context ? context.nextStep++ : undefined;
  const requestPayload = {
    model: args.model,
    input: args.input,
    tools: args.tools,
    reasoning: args.reasoningEffort ? { effort: args.reasoningEffort } : undefined,
    text: { format: zodTextFormat(args.schema, args.schemaName) },
    schemaName: args.schemaName
  };
  // A step is durable before contacting the provider. A recovered job reuses its
  // original request, or a completed response, rather than losing paid work.
  const runRow = context
    ? await withJobLease(context, async (tx) => {
        const old = await tx.modelRun.findUnique({
          where: { backgroundJobId_jobStep: { backgroundJobId: context.id, jobStep: step! } }
        });
        if (old && old.status !== ModelRunStatus.ERROR) {
          if (
            (old.requestPayload as { schemaName?: string }).schemaName !== args.schemaName ||
            old.purpose !== args.purpose
          ) {
            throw new Error("Stored model step is incompatible with this worker version");
          }
          return old;
        }
        // Preserve failed-attempt diagnostics while making a manual retry possible.
        if (old) await tx.modelRun.update({ where: { id: old.id }, data: { jobStep: null } });
        return tx.modelRun.create({
          data: {
            purpose: args.purpose,
            model: args.model,
            requestPayload: json(requestPayload),
            status: ModelRunStatus.PENDING,
            backgroundJobId: context.id,
            jobStep: step
          }
        });
      })
    : await prisma.modelRun.create({
        data: {
          purpose: args.purpose,
          model: args.model,
          requestPayload: json(requestPayload),
          status: ModelRunStatus.PENDING
        }
      });

  if (context && runRow.status === ModelRunStatus.COMPLETED) {
    const response = runRow.responsePayload as { output_parsed?: unknown } | null;
    const parsed = args.schema.parse(response?.output_parsed) as z.infer<S>;
    return { parsed, modelRunId: runRow.id, rawResponse: response };
  }
  const client = args.client ?? getOpenAI();
  const stored = context
    ? (runRow.requestPayload as unknown as typeof requestPayload)
    : requestPayload;
  let validResponse = false;
  let response: { output_parsed: unknown; usage?: unknown; status?: string } | undefined;
  const update = (data: Prisma.ModelRunUpdateInput) =>
    context
      ? withJobLease(context, (tx) => tx.modelRun.update({ where: { id: runRow.id }, data }))
      : prisma.modelRun.update({ where: { id: runRow.id }, data });
  try {
    context?.signal.throwIfAborted();
    const resp = await (
      client.responses as unknown as {
        parse: (
          body: Record<string, unknown>,
          options?: { timeout?: number; signal?: AbortSignal }
        ) => Promise<{ output_parsed: unknown; usage?: unknown; status?: string }>;
      }
    ).parse(
      {
        model: stored.model,
        input: stored.input,
        tools: stored.tools,
        reasoning: stored.reasoning,
        text: stored.text
      },
      args.timeoutMs || context
        ? {
            ...(args.timeoutMs ? { timeout: args.timeoutMs } : {}),
            ...(context ? { signal: context.signal } : {})
          }
        : undefined
    );
    response = resp;
    if (resp.status && resp.status !== "completed")
      throw new Error(`Model response did not complete (status: ${resp.status})`);
    const parsed = args.schema.parse(resp.output_parsed) as z.infer<S>;
    validResponse = true;
    try {
      await retryDatabaseOperation(() =>
        update({
          responsePayload: json({ ...resp, output_parsed: parsed }),
          usagePayload: json(resp.usage ?? {}),
          status: ModelRunStatus.COMPLETED
        })
      );
    } catch (loggingError) {
      // Owned jobs require a durable response checkpoint before advancing. If
      // the DB is down, lease recovery can retry the uncheckpointed step; never
      // let a stale worker overwrite a newly claimed job's result.
      if (context) throw loggingError;
      console.error("[runStructured] could not record completed model run:", loggingError);
    }
    return { parsed, modelRunId: runRow.id, rawResponse: resp };
  } catch (err) {
    if (context && validResponse) throw err;
    const message = err instanceof Error ? err.message : String(err);
    try {
      await update({
        status: ModelRunStatus.ERROR,
        error: message,
        ...(response
          ? { responsePayload: json(response), usagePayload: json(response.usage ?? {}) }
          : {})
      });
    } catch (loggingError) {
      console.error("[runStructured] could not record failed model run:", loggingError);
    }
    throw err;
  }
}
