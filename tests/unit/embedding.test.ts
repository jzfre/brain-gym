import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { problemEmbeddingText, embedText, EMBEDDING_DIMENSIONS } from "@/lib/memory/embedding";

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

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
    const expected = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1);
    const vec = await embedText("hello", async () => expected);
    expect(vec).toEqual(expected);
  });

  it.each([
    [], [0.1, 0.2], new Array(3072).fill(0.1),
    new Array(EMBEDDING_DIMENSIONS).fill(0),
    new Array(EMBEDDING_DIMENSIONS).fill(NaN),
    new Array(EMBEDDING_DIMENSIONS).fill(Infinity)
  ])("rejects unusable vectors without blocking generation (%#)", async (vector) => {
    expect(await embedText("hello", async () => vector)).toBeNull();
  });

  it("returns null when the embedder throws (non-fatal)", async () => {
    const vec = await embedText("hello", async () => {
      throw new Error("api down");
    });
    expect(vec).toBeNull();
  });
});
