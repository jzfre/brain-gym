import { describe, it, expect } from "vitest";
import { parseConfig } from "@/lib/config";

describe("parseConfig", () => {
  it("returns config when required env vars are set", () => {
    const cfg = parseConfig({
      DATABASE_URL: "postgresql://x",
      OPENAI_API_KEY: "sk-test",
      OPENAI_MODEL: "gpt-5.5",
      OPENAI_REASONING_EFFORT: "medium",
      LOCAL_USER_ID: "00000000-0000-0000-0000-000000000001",
      APP_PASSWORD: "test-password"
    });
    expect(cfg.openai.model).toBe("gpt-5.5");
    expect(cfg.localUserId).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("throws when OPENAI_API_KEY is missing", () => {
    expect(() =>
      parseConfig({
        DATABASE_URL: "postgresql://x",
        OPENAI_MODEL: "gpt-5.5",
        OPENAI_REASONING_EFFORT: "medium",
        LOCAL_USER_ID: "00000000-0000-0000-0000-000000000001",
      APP_PASSWORD: "test-password"
      } as Record<string, string>)
    ).toThrow(/OPENAI_API_KEY/);
  });

  it("defaults reasoning effort to medium when unset", () => {
    const cfg = parseConfig({
      DATABASE_URL: "postgresql://x",
      OPENAI_API_KEY: "sk-test",
      OPENAI_MODEL: "gpt-5.5",
      LOCAL_USER_ID: "00000000-0000-0000-0000-000000000001",
      APP_PASSWORD: "test-password"
    });
    expect(cfg.openai.reasoningEffort).toBe("medium");
  });
});

const baseEnv = {
  DATABASE_URL: "postgresql://brain:brain@localhost:5438/brain_gym?schema=public",
  OPENAI_API_KEY: "sk-test",
  OPENAI_MODEL: "gpt-5.5",
  LOCAL_USER_ID: "00000000-0000-0000-0000-000000000001",
  APP_PASSWORD: "pw"
};

describe("config: embedding & dedup", () => {
  it("applies defaults when not set", () => {
    const cfg = parseConfig(baseEnv);
    expect(cfg.embedding.model).toBe("text-embedding-3-small");
    expect(cfg.dedup.similarityThreshold).toBe(0.85);
    expect(cfg.dedup.maxRetries).toBe(3);
    expect(cfg.dedup.neighborK).toBe(5);
  });

  it("reads overrides and coerces numbers", () => {
    const cfg = parseConfig({
      ...baseEnv,
      EMBEDDING_MODEL: "text-embedding-3-large",
      DEDUP_SIMILARITY_THRESHOLD: "0.9",
      DEDUP_MAX_RETRIES: "5",
      DEDUP_NEIGHBOR_K: "8"
    });
    expect(cfg.embedding.model).toBe("text-embedding-3-large");
    expect(cfg.dedup.similarityThreshold).toBe(0.9);
    expect(cfg.dedup.maxRetries).toBe(5);
    expect(cfg.dedup.neighborK).toBe(8);
  });
});
