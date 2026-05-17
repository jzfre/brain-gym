import { describe, it, expect, vi, beforeEach } from "vitest";
import { ModelRunPurpose } from "@prisma/client";
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
});

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
