import { describe, it, expect } from "vitest";
import { computeUniquenessHash } from "@/lib/memory/uniqueness";

describe("computeUniquenessHash", () => {
  it("is stable for the same inputs", () => {
    const a = computeUniquenessHash({
      title: "Queue Backpressure in Billing",
      promptText: "At 02:14 UTC, the billing-pipeline service began ...",
      tags: ["queue", "billing", "retry-amplification"]
    });
    const b = computeUniquenessHash({
      title: "Queue Backpressure in Billing",
      promptText: "At 02:14 UTC, the billing-pipeline service began ...",
      tags: ["billing", "queue", "retry-amplification"]
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs when title or tags change", () => {
    const base = computeUniquenessHash({ title: "A", promptText: "x", tags: ["t1"] });
    const diffTitle = computeUniquenessHash({ title: "B", promptText: "x", tags: ["t1"] });
    const diffTag = computeUniquenessHash({ title: "A", promptText: "x", tags: ["t2"] });
    expect(base).not.toBe(diffTitle);
    expect(base).not.toBe(diffTag);
  });

  it("is case- and whitespace-insensitive for title", () => {
    const a = computeUniquenessHash({ title: "  Hello World  ", promptText: "p", tags: [] });
    const b = computeUniquenessHash({ title: "hello world", promptText: "p", tags: [] });
    expect(a).toBe(b);
  });
});
