import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobCapacityError, JobConflictError } from "@/lib/jobs/types";

const deps = vi.hoisted(() => ({ enqueue: vi.fn(), get: vi.fn(), wake: vi.fn() }));
vi.mock("@/lib/config", () => ({ getConfig: () => ({ localUserId: "local-user" }) }));
vi.mock("@/lib/jobs/worker", () => ({ wakeWorker: deps.wake }));
vi.mock("@/lib/jobs/store", async () => ({
  ...(await import("@/lib/jobs/types")),
  enqueueJob: deps.enqueue,
  getJob: deps.get
}));
import { POST } from "@/app/api/problems/generate/route";
import { GET } from "@/app/api/problems/generate/[jobId]/route";

const request = (body: unknown = { exerciseSlug: "MEMO_EXTRACTION", difficulty: "MEDIUM" }) =>
  POST(
    new Request("http://x/api/problems/generate", { method: "POST", body: JSON.stringify(body) })
  );
const poll = () => GET(new Request("http://x"), { params: Promise.resolve({ jobId: "job-id" }) });
beforeEach(() => {
  vi.resetAllMocks();
  deps.enqueue.mockResolvedValue({ id: "job-id" });
});

describe("durable generation routes", () => {
  it("waits for durable enqueue before acknowledging or waking a worker", async () => {
    let persist!: (value: { id: string }) => void;
    deps.enqueue.mockReturnValueOnce(
      new Promise((resolve) => {
        persist = resolve;
      })
    );
    let acknowledged = false;
    const pending = request().then((response) => {
      acknowledged = true;
      return response;
    });
    await vi.waitFor(() => expect(deps.enqueue).toHaveBeenCalledOnce());
    expect(acknowledged).toBe(false);
    expect(deps.wake).not.toHaveBeenCalled();
    persist({ id: "saved-job" });
    const response = await pending;
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ jobId: "saved-job" });
    expect(deps.wake).toHaveBeenCalledOnce();
  });

  it("does not acknowledge an enqueue that failed to persist", async () => {
    deps.enqueue.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(request()).rejects.toThrow("database unavailable");
    expect(deps.wake).not.toHaveBeenCalled();
  });

  it("returns capacity pressure without waking another worker", async () => {
    deps.enqueue.mockRejectedValueOnce(new JobCapacityError("GENERATION"));
    const response = await request();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("10");
    expect(deps.wake).not.toHaveBeenCalled();
  });

  it("rejects invalid options before enqueue", async () => {
    expect((await request({ exerciseSlug: "unknown", difficulty: "MEDIUM" })).status).toBe(400);
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it("passes a stable client request key for lost-acknowledgement replay", async () => {
    const clientGenerationId = "00000000-0000-4000-8000-000000000001";
    expect(
      (await request({ exerciseSlug: "MEMO_EXTRACTION", difficulty: "MEDIUM", clientGenerationId }))
        .status
    ).toBe(202);
    expect(deps.enqueue).toHaveBeenCalledWith({
      kind: "GENERATION",
      userId: "local-user",
      dedupeKey: clientGenerationId,
      payload: { exerciseSlug: "MEMO_EXTRACTION", difficulty: "MEDIUM" }
    });
  });

  it("rejects changed options reusing the same client request", async () => {
    deps.enqueue.mockRejectedValueOnce(new JobConflictError());
    expect((await request()).status).toBe(409);
  });

  it.each([
    ["QUEUED", "pending"],
    ["RUNNING", "pending"],
    ["SUCCEEDED", "succeeded"],
    ["FAILED", "failed"]
  ])("reads persisted %s state without relying on process memory", async (status, publicStatus) => {
    deps.get.mockResolvedValueOnce({
      kind: "GENERATION",
      status,
      result: status === "SUCCEEDED" ? { problemId: "problem-id" } : null,
      error: null
    });
    const response = await poll();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).status).toBe(publicStatus);
    expect(deps.get).toHaveBeenCalledWith("job-id", "local-user");
  });

  it.each([null, { kind: "EVALUATION" }])(
    "hides unknown, other-user, and wrong-kind jobs",
    async (job) => {
      deps.get.mockResolvedValueOnce(job);
      expect((await poll()).status).toBe(404);
    }
  );
});
