import { describe, it, expect } from "vitest";
import { problemEmbeddingText } from "@/lib/memory/embedding";

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
});
