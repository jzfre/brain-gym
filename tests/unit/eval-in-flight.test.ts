import { describe, it, expect, vi } from "vitest";

describe("evaluation in-flight set", () => {
  it("tracks attempts until cleared", async () => {
    const { markInFlight, isInFlight, clearInFlight } = await import("@/lib/evaluation/in-flight");
    markInFlight(1);
    expect(isInFlight(1)).toBe(true);
    clearInFlight(1);
    expect(isInFlight(1)).toBe(false);
  });

  it("survives the module being re-evaluated (next dev reloads server modules on compile)", async () => {
    const first = await import("@/lib/evaluation/in-flight");
    first.markInFlight(2);
    vi.resetModules();
    const second = await import("@/lib/evaluation/in-flight");
    expect(second).not.toBe(first);
    expect(second.isInFlight(2)).toBe(true);
    second.clearInFlight(2);
  });
});
