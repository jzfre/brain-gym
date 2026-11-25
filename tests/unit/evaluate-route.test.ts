import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobCapacityError } from "@/lib/jobs/types";
const deps = vi.hoisted(() => ({ find: vi.fn(), enqueue: vi.fn(), wake: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { attempt: { findUnique: deps.find } } }));
vi.mock("@/lib/config", () => ({ getConfig: () => ({ localUserId: "local-user" }) }));
vi.mock("@/lib/jobs/worker", () => ({ wakeWorker: deps.wake }));
vi.mock("@/lib/jobs/store", async () => ({
  ...(await import("@/lib/jobs/types")),
  enqueueJob: deps.enqueue
}));
import { POST } from "@/app/api/attempts/[id]/evaluate/route";
const call = (id: string = "7") =>
  POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id }) });
beforeEach(() => {
  vi.resetAllMocks();
  deps.find.mockResolvedValue({ id: 7, status: "SUBMITTED", evaluation: null });
  deps.enqueue.mockResolvedValue({ id: "saved-job" });
});

describe("durable evaluation route", () => {
  it.each(["0", "-1", "1.5", "1e2", "2147483648", "", " 7 "])(
    "rejects invalid attempt ID %j before querying",
    async (id) => {
      expect((await call(id)).status).toBe(400);
      expect(deps.find).not.toHaveBeenCalled();
    }
  );

  it("scopes attempts to the configured user", async () => {
    deps.find.mockResolvedValueOnce(null);
    expect((await call()).status).toBe(404);
    expect(deps.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7, userId: "local-user" } })
    );
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it("returns completed feedback without enqueueing more work", async () => {
    deps.find.mockResolvedValueOnce({ id: 7, evaluation: { id: "evaluation-id" } });
    const response = await call();
    expect(await response.json()).toEqual({ status: "evaluated", evaluationId: "evaluation-id" });
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it("uses the attempt ID as durable dedupe key for concurrent or retried POSTs", async () => {
    const responses = await Promise.all([call(), call()]);
    expect(responses.map((response) => response.status)).toEqual([202, 202]);
    expect(deps.enqueue).toHaveBeenCalledWith({
      kind: "EVALUATION",
      userId: "local-user",
      payload: { attemptId: 7 },
      dedupeKey: "7"
    });
    expect(await responses[0].json()).toEqual({ status: "evaluating", jobId: "saved-job" });
  });

  it("waits for the durable enqueue before responding 202", async () => {
    let finish!: (job: { id: string }) => void;
    deps.enqueue.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    let acknowledged = false;
    const pending = call().then((response) => {
      acknowledged = true;
      return response;
    });
    await vi.waitFor(() => expect(deps.enqueue).toHaveBeenCalledOnce());
    expect(acknowledged).toBe(false);
    expect(deps.wake).not.toHaveBeenCalled();
    finish({ id: "saved-job" });
    expect((await pending).status).toBe(202);
  });

  it("does not acknowledge work if persistence fails", async () => {
    deps.enqueue.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(call()).rejects.toThrow("database unavailable");
    expect(deps.wake).not.toHaveBeenCalled();
  });

  it("returns retryable capacity pressure instead of starting another evaluator", async () => {
    deps.enqueue.mockRejectedValueOnce(new JobCapacityError("EVALUATION"));
    const response = await call();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("10");
    expect(deps.wake).not.toHaveBeenCalled();
  });
});
