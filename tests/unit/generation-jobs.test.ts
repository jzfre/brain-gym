import { describe, it, expect, beforeEach } from "vitest";
import { clearJobs, completeJob, createJob, failJob, getJob } from "@/lib/generation/jobs";

beforeEach(() => clearJobs());

describe("generation job store", () => {
  it("creates a pending job and reads it back", () => {
    const id = createJob();
    expect(getJob(id)).toMatchObject({ status: "pending" });
  });

  it("returns undefined for unknown ids", () => {
    expect(getJob("nope")).toBeUndefined();
  });

  it("marks a job succeeded with its problemId", () => {
    const id = createJob();
    completeJob(id, "prob-1");
    expect(getJob(id)).toMatchObject({ status: "succeeded", problemId: "prob-1" });
  });

  it("marks a job failed with the error message", () => {
    const id = createJob();
    failJob(id, "boom");
    expect(getJob(id)).toMatchObject({ status: "failed", error: "boom" });
  });

  it("ignores complete/fail for unknown ids", () => {
    completeJob("nope", "prob-1");
    failJob("nope", "boom");
    expect(getJob("nope")).toBeUndefined();
  });

  it("prunes settled jobs after 30 minutes but keeps pending ones", () => {
    const t0 = 1_000_000;
    const settled = createJob(t0);
    completeJob(settled, "prob-1");
    const pending = createJob(t0);
    createJob(t0 + 31 * 60 * 1000); // triggers prune relative to t0
    expect(getJob(settled)).toBeUndefined();
    expect(getJob(pending)).toBeDefined(); // still inside the 2h pending leash
  });

  it("prunes pending jobs after 2 hours", () => {
    const t0 = 1_000_000;
    const orphan = createJob(t0);
    createJob(t0 + 2 * 60 * 60 * 1000 + 1); // triggers prune relative to t0
    expect(getJob(orphan)).toBeUndefined();
  });

  it("issues unique ids", () => {
    expect(createJob()).not.toBe(createJob());
  });
});
