import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Prisma, ModelRunPurpose } from "@prisma/client";
import { runStructured } from "@/lib/openai/run-model";
import { z } from "zod";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    modelRun: {
      create: vi.fn(async ({ data }) => ({ id: "run-1", ...data })),
      update: vi.fn(async ({ data }) => data)
    }
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("runStructured", () => {
  const Schema = z.object({ title: z.string(), score: z.number() });

  it("validates output and returns parsed value", async () => {
    const fakeClient = {
      responses: {
        parse: vi.fn(async () => ({
          output_parsed: { title: "hi", score: 7 },
          usage: { input_tokens: 10, output_tokens: 5 }
        }))
      }
    };
    const result = await runStructured({
      purpose: ModelRunPurpose.GENERATE_PROBLEM,
      model: "gpt-5.5",
      input: "hello",
      schema: Schema,
      schemaName: "demo",
      client: fakeClient as never
    });
    expect(result.parsed).toEqual({ title: "hi", score: 7 });
    expect(result.modelRunId).toBe("run-1");
  });

  it("passes a per-request timeout to responses.parse when timeoutMs is set", async () => {
    const parse = vi.fn(
      async (_req: Record<string, unknown>, _opts?: { timeout?: number }) => ({
        output_parsed: { title: "hi", score: 7 },
        usage: {}
      })
    );
    const fakeClient = { responses: { parse } };
    await runStructured({
      purpose: ModelRunPurpose.EVALUATE_ATTEMPT,
      model: "gpt-5.5",
      input: "x",
      schema: Schema,
      schemaName: "demo",
      timeoutMs: 300_000,
      client: fakeClient as never
    });
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse.mock.calls[0][1]).toEqual({ timeout: 300_000 });
  });

  it("forwards reasoning effort to the API and records it on the model run", async () => {
    const { prisma } = await import("@/lib/db/client");
    const parse = vi.fn(async (_req: Record<string, unknown>) => ({
      output_parsed: { title: "hi", score: 7 },
      usage: {}
    }));
    const fakeClient = { responses: { parse } };
    await runStructured({
      purpose: ModelRunPurpose.EVALUATE_ATTEMPT,
      model: "gpt-6-sol",
      input: "x",
      schema: Schema,
      schemaName: "demo",
      reasoningEffort: "xhigh",
      client: fakeClient as never
    });
    expect(parse.mock.calls[0][0].reasoning).toEqual({ effort: "xhigh" });
    const created = vi.mocked(prisma.modelRun.create).mock.calls[0][0];
    expect(created.data.requestPayload).toMatchObject({ reasoning: { effort: "xhigh" } });
  });

  it("omits per-request options when timeoutMs is not set", async () => {
    const parse = vi.fn(
      async (_req: Record<string, unknown>, _opts?: { timeout?: number }) => ({
        output_parsed: { title: "hi", score: 7 },
        usage: {}
      })
    );
    const fakeClient = { responses: { parse } };
    await runStructured({
      purpose: ModelRunPurpose.GENERATE_PROBLEM,
      model: "gpt-5.5",
      input: "x",
      schema: Schema,
      schemaName: "demo",
      client: fakeClient as never
    });
    expect(parse.mock.calls[0][1]).toBeUndefined();
  });

  it("retains the response and token usage when validation fails", async () => {
    const { prisma } = await import("@/lib/db/client");
    const response = { output_parsed: null, usage: { input_tokens: 12 }, status: "completed" };
    await expect(runStructured({
      purpose: ModelRunPurpose.EVALUATE_ATTEMPT, model: "test", input: "x",
      schema: Schema, schemaName: "demo",
      client: { responses: { parse: vi.fn().mockResolvedValue(response) } } as never
    })).rejects.toThrow();
    expect(prisma.modelRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ERROR", responsePayload: response, usagePayload: response.usage })
    }));
  });

  it("rejects an incomplete response even when parsed content looks valid", async () => {
    const { prisma } = await import("@/lib/db/client");
    await expect(runStructured({
      purpose: ModelRunPurpose.GENERATE_PROBLEM, model: "test", input: "x",
      schema: Schema, schemaName: "demo", client: { responses: { parse: vi.fn().mockResolvedValue({
        output_parsed: { title: "hi", score: 7 }, status: "incomplete"
      }) } } as never
    })).rejects.toThrow("did not complete");
    expect(prisma.modelRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ERROR" })
    }));
  });

  it("preserves the provider error when writing diagnostics also fails", async () => {
    const { prisma } = await import("@/lib/db/client");
    vi.mocked(prisma.modelRun.update).mockRejectedValueOnce(new Error("DB offline"));
    const providerError = new Error("Provider unavailable");
    await expect(runStructured({
      purpose: ModelRunPurpose.EVALUATE_ATTEMPT, model: "test", input: "x",
      schema: Schema, schemaName: "demo",
      client: { responses: { parse: vi.fn().mockRejectedValue(providerError) } } as never
    })).rejects.toBe(providerError);
  });

  it("throws and logs error when schema fails", async () => {
    const fakeClient = {
      responses: {
        parse: vi.fn(async () => ({ output_parsed: { title: 5 }, usage: {} }))
      }
    };
    await expect(
      runStructured({
        purpose: ModelRunPurpose.EVALUATE_ATTEMPT,
        model: "gpt-5.5",
        input: "x",
        schema: Schema,
        schemaName: "demo",
        client: fakeClient as never
      })
    ).rejects.toThrow();
  });
});


describe("successful paid output persistence", () => {
  it("retries transient bookkeeping failures without repeating the model call", async () => {
    const { prisma } = await import("@/lib/db/client");
    vi.mocked(prisma.modelRun.update).mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("DB reconnecting", { code: "P1017", clientVersion: "test" }));
    const parse = vi.fn().mockResolvedValue({ status: "completed", output_parsed: { score: 7 }, usage: {} });
    const result = await runStructured({ purpose: ModelRunPurpose.EVALUATE_ATTEMPT, model: "test", input: "x", schema: z.object({ score: z.number() }), schemaName: "demo", client: { responses: { parse } } as never });
    expect(result.parsed.score).toBe(7);
    expect(parse).toHaveBeenCalledOnce();
    expect(prisma.modelRun.update).toHaveBeenCalledTimes(2);
    expect(vi.mocked(prisma.modelRun.update).mock.calls.every(([args]) => args.data.status === "COMPLETED")).toBe(true);
  });

  it("retains valid output when bookkeeping fails permanently instead of relabeling it ERROR", async () => {
    const { prisma } = await import("@/lib/db/client");
    vi.mocked(prisma.modelRun.update).mockRejectedValueOnce(new Error("DB unavailable"));
    const parse = vi.fn().mockResolvedValue({ status: "completed", output_parsed: { score: 7 } });
    const result = await runStructured({ purpose: ModelRunPurpose.EVALUATE_ATTEMPT, model: "test", input: "x", schema: z.object({ score: z.number() }), schemaName: "demo", client: { responses: { parse } } as never });
    expect(result.parsed.score).toBe(7);
    expect(parse).toHaveBeenCalledOnce();
    expect(prisma.modelRun.update).toHaveBeenCalledOnce();
    expect(vi.mocked(prisma.modelRun.update).mock.calls[0][0].data.status).toBe("COMPLETED");
  });
});
