import { Prisma } from "@prisma/client";
import { beforeEach, expect, it, vi } from "vitest";
import { setTimeout } from "node:timers/promises";
import { retryDatabaseOperation } from "@/lib/db/retry";

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn(async () => {}) }));
beforeEach(() => vi.clearAllMocks());
const failure = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("database error", { code, clientVersion: "test" });

it("retries only persistence after a temporary connection failure", async () => {
  const operation = vi
    .fn()
    .mockRejectedValueOnce(failure("P1017"))
    .mockResolvedValueOnce({ id: "saved" });
  expect(await retryDatabaseOperation(operation)).toEqual({ id: "saved" });
  expect(operation).toHaveBeenCalledTimes(2);
  expect(setTimeout).toHaveBeenCalledWith(250);
});

it("bounds prolonged outages and preserves the final database error", async () => {
  const error = failure("P1001");
  const operation = vi.fn().mockRejectedValue(error);
  await expect(retryDatabaseOperation(operation)).rejects.toBe(error);
  expect(operation).toHaveBeenCalledTimes(4);
  expect(vi.mocked(setTimeout).mock.calls.map(([ms]) => ms)).toEqual([250, 1000, 3000]);
});

it.each(["P2002", "P2003", "P2025"])(
  "does not retry non-transient constraint/data errors (%s)",
  async (code) => {
    const error = failure(code);
    const operation = vi.fn().mockRejectedValue(error);
    await expect(retryDatabaseOperation(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(setTimeout).not.toHaveBeenCalled();
  }
);

it("does not mistake an application bug for a transient outage", async () => {
  const error = new Error("invalid evaluation");
  const operation = vi.fn().mockRejectedValue(error);
  await expect(retryDatabaseOperation(operation)).rejects.toBe(error);
  expect(operation).toHaveBeenCalledTimes(1);
});
