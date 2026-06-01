import { describe, it, expect } from "vitest";
import { problemEmbeddingText } from "@/lib/memory/embedding";
import { embedText } from "@/lib/memory/embedding";

describe("problemEmbeddingText", () => {
  it("combines title, prompt, and sorted tags deterministically", () => {
    const a = problemEmbeddingText({
      title: "  Queue Backpressure  ",
      userVisiblePrompt: "At 02:14 UTC...",
      tags: ["retry", "billing"]
    });
    const b = problemEmbeddingText({
      title: "Queue Backpressure",
      userVisiblePrompt: "At 02:14 UTC...",
      tags: ["billing", "retry"]
    });
    expect(a).toBe(b);
    expect(a).toContain("Queue Backpressure");
    expect(a).toContain("billing, retry");
  });

  it("appends LSAT question stimuli and stems when present", () => {
    const text = problemEmbeddingText({
      title: "LR Set",
      userVisiblePrompt: "Answer all.",
      tags: [],
      questions: [
        { stimulus: "All cats are mammals.", questionStem: "Which must be true?" }
      ]
    });
    expect(text).toContain("All cats are mammals.");
    expect(text).toContain("Which must be true?");
  });

  it("treats an empty questions array the same as no questions", () => {
    const withEmpty = problemEmbeddingText({ title: "T", userVisiblePrompt: "P", tags: ["x"], questions: [] });
    const without = problemEmbeddingText({ title: "T", userVisiblePrompt: "P", tags: ["x"] });
    expect(withEmpty).toBe(without);
  });

  it("is whitespace-insensitive for question stimulus and stem", () => {
    const a = problemEmbeddingText({ title: "T", userVisiblePrompt: "P", tags: [], questions: [{ stimulus: "  S  ", questionStem: "  Q  " }] });
    const b = problemEmbeddingText({ title: "T", userVisiblePrompt: "P", tags: [], questions: [{ stimulus: "S", questionStem: "Q" }] });
    expect(a).toBe(b);
  });
});

describe("embedText", () => {
  it("uses the injected embedder when provided", async () => {
    const vec = await embedText("hello", async () => [0.1, 0.2, 0.3]);
    expect(vec).toEqual([0.1, 0.2, 0.3]);
  });

  it("returns null when the embedder throws (non-fatal)", async () => {
    const vec = await embedText("hello", async () => {
      throw new Error("api down");
    });
    expect(vec).toBeNull();
  });
});
