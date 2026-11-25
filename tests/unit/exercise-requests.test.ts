import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pollForProblem, saveAttemptAndEvaluate, startEvaluation } from "@/components/today/requests";

const fetchMock = vi.fn();
const answer = { clientSubmissionId: "00000000-0000-4000-8000-000000000002", problemId: "problem", responseText: "My answer", timeSpentSeconds: 42 };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("saving answers", () => {
  it("starts evaluation using the saved attempt ID", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ attemptId: 7 }))
      .mockResolvedValueOnce(Response.json({}, { status: 202 }));
    await expect(saveAttemptAndEvaluate(answer)).resolves.toBe(7);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(answer);
    expect(fetchMock.mock.calls[1]).toEqual(["/api/attempts/7/evaluate", { method: "POST" }]);
  });

  it.each(["http", "network"])("preserves the saved attempt when evaluation fails (%s)", async (failure) => {
    fetchMock.mockResolvedValueOnce(Response.json({ attemptId: 7 }));
    if (failure === "http") fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    else fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    // The editor must show feedback for this ID, not offer another submission.
    await expect(saveAttemptAndEvaluate(answer)).resolves.toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not evaluate when saving failed", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ message: "Answer too long" }, { status: 400 }));
    await expect(saveAttemptAndEvaluate(answer)).rejects.toThrow("Answer too long");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing saved ID instead of evaluating undefined", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({}));
    await expect(saveAttemptAndEvaluate(answer)).rejects.toThrow("Check History");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports an expired session when retrying evaluation", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(startEvaluation(7)).rejects.toThrow("session expired");
  });
});

describe("generation polling", () => {
  beforeEach(() => vi.useFakeTimers());

  it("recovers from transient network and proxy failures without generating again", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }))
      .mockResolvedValueOnce(Response.json({ status: "succeeded", problemId: "p1" }));
    const result = pollForProblem("job-1", new AbortController().signal);
    const assertion = expect(result).resolves.toBe("p1");
    await vi.advanceTimersByTimeAsync(9000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([url]) => url === "/api/problems/generate/job-1")).toBe(true);
  });

  it.each([401, 403, 404])("stops promptly for terminal HTTP %i", async (status) => {
    fetchMock.mockResolvedValueOnce(new Response("Not JSON", { status }));
    const result = pollForProblem("job-1", new AbortController().signal);
    const assertion = expect(result).rejects.toThrow(status === 404 ? "generation could not be found" : "session expired");
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports the job failure", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ status: "failed", error: "Provider unavailable" }));
    const assertion = expect(pollForProblem("job-1", new AbortController().signal)).rejects.toThrow("Provider unavailable");
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
  });

  it("cancels scheduled polling on navigation", async () => {
    const controller = new AbortController();
    const assertion = expect(pollForProblem("job-1", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await assertion;
    await vi.advanceTimersByTimeAsync(9000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels an in-flight request on navigation", async () => {
    fetchMock.mockImplementationOnce((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(options.signal?.reason));
    }));
    const controller = new AbortController();
    const assertion = expect(pollForProblem("job-1", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(3000);
    controller.abort();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
