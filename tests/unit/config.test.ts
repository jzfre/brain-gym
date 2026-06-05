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

describe("config: openai timeout", () => {
  it("defaults to 20 minutes", () => {
    expect(parseConfig(baseEnv).openai.timeoutMs).toBe(1_200_000);
  });

  it("reads an override and coerces it", () => {
    expect(parseConfig({ ...baseEnv, OPENAI_TIMEOUT_MS: "300000" }).openai.timeoutMs).toBe(300_000);
  });

  it("rejects sub-second and non-integer values", () => {
    expect(() => parseConfig({ ...baseEnv, OPENAI_TIMEOUT_MS: "999" })).toThrow();
    expect(() => parseConfig({ ...baseEnv, OPENAI_TIMEOUT_MS: "1.5e4.2" })).toThrow();
  });
});

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

  it("rejects out-of-bounds and non-integer dedup values", () => {
    expect(() => parseConfig({ ...baseEnv, DEDUP_SIMILARITY_THRESHOLD: "1.5" })).toThrow();
    expect(() => parseConfig({ ...baseEnv, DEDUP_SIMILARITY_THRESHOLD: "-0.1" })).toThrow();
    expect(() => parseConfig({ ...baseEnv, DEDUP_MAX_RETRIES: "0" })).toThrow();
    expect(() => parseConfig({ ...baseEnv, DEDUP_MAX_RETRIES: "2.5" })).toThrow();
    expect(() => parseConfig({ ...baseEnv, DEDUP_NEIGHBOR_K: "0" })).toThrow();
  });
});
