import { beforeEach, describe, expect, it, vi } from "vitest";
const deps = vi.hoisted(() => ({ find: vi.fn(), job: vi.fn() }));
vi.mock("@/lib/config", () => ({ getConfig: () => ({ localUserId: "local-user" }) }));
vi.mock("@/lib/db/client", () => ({ prisma: { attempt: { findUnique: deps.find } } }));
vi.mock("@/lib/jobs/store", () => ({ getEvaluationJob: deps.job }));
import { GET } from "@/app/api/history/[attemptId]/route";
const unevaluated = {
  id: 9,
  responseText: "Answer",
  timeSpentSeconds: 1,
  submittedAt: new Date(0),
  status: "SUBMITTED",
  problem: {},
  evaluation: null
};
const request = (attemptId = "9") =>
  GET(new Request("http://x"), { params: Promise.resolve({ attemptId }) });
beforeEach(() => {
  vi.resetAllMocks();
  deps.find.mockResolvedValue(unevaluated);
  deps.job.mockResolvedValue(null);
});

describe("durable evaluation status polling", () => {
  it.each(["QUEUED", "RUNNING"])(
    "reports %s work active across process restarts",
    async (status) => {
      deps.job.mockResolvedValue({ status });
      expect((await (await request()).json()).evaluating).toBe(true);
      expect(deps.job).toHaveBeenCalledWith(9, "local-user");
    }
  );

  it("does not misreport work completing during the attempt read as interrupted", async () => {
    deps.job
      .mockResolvedValueOnce({ status: "RUNNING" })
      .mockResolvedValueOnce({ status: "SUCCEEDED" });
    expect((await (await request()).json()).evaluating).toBe(true);
  });

  it("reports retry starting during the attempt read as active", async () => {
    deps.job
      .mockResolvedValueOnce({ status: "FAILED" })
      .mockResolvedValueOnce({ status: "QUEUED" });
    expect((await (await request()).json()).evaluating).toBe(true);
  });

  it("reports durable worker failure even if the attempt's old status was submitted", async () => {
    deps.job.mockResolvedValue({ status: "FAILED" });
    const data = await (await request()).json();
    expect(data.attempt.status).toBe("EVAL_FAILED");
    expect(data.evaluating).toBe(false);
  });

  it("preserves completed feedback over a stale failed job", async () => {
    deps.find.mockResolvedValue({
      ...unevaluated,
      status: "EVALUATED",
      evaluation: { id: "result" }
    });
    deps.job.mockResolvedValue({ status: "FAILED" });
    expect((await (await request()).json()).attempt.status).toBe("EVALUATED");
  });

  it("scopes history details to the configured user", async () => {
    deps.find.mockResolvedValueOnce(null);
    expect((await request()).status).toBe(404);
    expect(deps.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 9, userId: "local-user" } })
    );
  });

  it.each(["0", "-1", "1.5", "1e2", "2147483648", "", " 9 "])(
    "rejects invalid ID %j before querying",
    async (id) => {
      expect((await request(id)).status).toBe(400);
      expect(deps.find).not.toHaveBeenCalled();
      expect(deps.job).not.toHaveBeenCalled();
    }
  );
});
