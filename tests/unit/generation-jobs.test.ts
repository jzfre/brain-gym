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

  it("prunes jobs older than 30 minutes on insert", () => {
    const t0 = 1_000_000;
    const old = createJob(t0);
    const fresh = createJob(t0 + 29 * 60 * 1000);
    createJob(t0 + 31 * 60 * 1000); // triggers prune relative to t0
    expect(getJob(old)).toBeUndefined();
    expect(getJob(fresh)).toBeDefined();
  });

  it("issues unique ids", () => {
    expect(createJob()).not.toBe(createJob());
  });
});
