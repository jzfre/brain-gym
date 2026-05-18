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
