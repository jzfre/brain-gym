import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z, ZodType } from "zod";
import { ModelRunPurpose, ModelRunStatus } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { getOpenAI } from "./client";

export type WebSearchTool = { type: "web_search" };

export type RunStructuredArgs<S extends ZodType> = {
  purpose: ModelRunPurpose;
  model: string;
  input: string | Array<{ role: "system" | "user" | "developer"; content: string }>;
  schema: S;
  schemaName: string;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  tools?: WebSearchTool[];
  client?: Pick<OpenAI, "responses">;
};

export type RunStructuredResult<S extends ZodType> = {
  parsed: z.infer<S>;
  modelRunId: string;
  rawResponse: unknown;
};

export async function runStructured<S extends ZodType>(
  args: RunStructuredArgs<S>
): Promise<RunStructuredResult<S>> {
  const client = args.client ?? getOpenAI();

  const requestPayload = {
    model: args.model,
    input: args.input,
    tools: args.tools,
    reasoning: args.reasoningEffort ? { effort: args.reasoningEffort } : undefined
  };

  const runRow = await prisma.modelRun.create({
    data: {
      purpose: args.purpose,
      model: args.model,
      requestPayload: requestPayload as unknown as object,
      status: ModelRunStatus.PENDING
    }
  });

  try {
    const resp = await (
      client.responses as unknown as {
        parse: (req: Record<string, unknown>) => Promise<{
          output_parsed: unknown;
          usage?: unknown;
        }>;
      }
    ).parse({
      model: args.model,
      input: args.input,
      text: { format: zodTextFormat(args.schema, args.schemaName) },
      tools: args.tools,
      reasoning: args.reasoningEffort ? { effort: args.reasoningEffort } : undefined
    });

    const parsed = args.schema.parse(resp.output_parsed) as z.infer<S>;

    await prisma.modelRun.update({
      where: { id: runRow.id },
      data: {
        responsePayload: resp as unknown as object,
        usagePayload: (resp.usage ?? {}) as object,
        status: ModelRunStatus.COMPLETED
      }
    });

    return { parsed, modelRunId: runRow.id, rawResponse: resp };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.modelRun.update({
      where: { id: runRow.id },
      data: { status: ModelRunStatus.ERROR, error: message }
    });
    throw err;
  }
}
