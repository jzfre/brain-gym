import { describe, expect, it } from "vitest";
import {
  clearPendingGeneration,
  generationRecoveryPath,
  parsePendingGeneration,
  PENDING_GENERATION_KEY,
  readPendingGeneration,
  validGenerationId,
  writePendingGeneration
} from "@/components/today/generation-storage";

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    }
  };
}

describe("pending generation recovery", () => {
  it("persists an unacknowledged request and restores the exact original request UUID and options", () => {
    const disk = storage();
    const request = {
      version: 1 as const,
      clientGenerationId: first,
      exerciseSlug: "LSAT_LOGICAL_REASONING" as const,
      difficulty: "HARD" as const
    };
    writePendingGeneration(disk, request);
    expect(readPendingGeneration(disk)).toEqual(request);
    const path = new URL(generationRecoveryPath(request), "http://localhost");
    expect(path.searchParams.get("generationId")).toBe(first);
    expect(path.searchParams.get("exerciseSlug")).toBe("LSAT_LOGICAL_REASONING");
    expect(path.searchParams.get("difficulty")).toBe("HARD");
    expect(parsePendingGeneration({ ...request, difficulty: "INVALID" })).toBeNull();
    clearPendingGeneration(disk, first);
    expect(readPendingGeneration(disk)).toBeNull();
  });

  it("restores an accepted job and clears only that job", () => {
    const disk = storage();
    writePendingGeneration(disk, { version: 1, jobId: first });
    expect(readPendingGeneration(disk)?.jobId).toBe(first);
    writePendingGeneration(disk, { version: 1, jobId: second });
    clearPendingGeneration(disk, first);
    expect(readPendingGeneration(disk)?.jobId).toBe(second);
    clearPendingGeneration(disk, second);
    expect(readPendingGeneration(disk)).toBeNull();
  });

  it.each(["{", "null", "[]", '{"version":99}', '{"version":1,"jobId":"invalid"}'])(
    "ignores corrupt pending state (%s)",
    (raw) => {
      const disk = storage();
      disk.setItem(PENDING_GENERATION_KEY, raw);
      expect(readPendingGeneration(disk)).toBeNull();
    }
  );

  it("tolerates unavailable browser storage", () => {
    const blocked = () => {
      throw new Error("storage blocked");
    };
    const disk = { getItem: blocked, setItem: blocked, removeItem: blocked };
    expect(readPendingGeneration(disk)).toBeNull();
    expect(() => writePendingGeneration(disk, { version: 1, jobId: first })).not.toThrow();
    expect(() => clearPendingGeneration(disk, first)).not.toThrow();
  });

  it("rejects invalid job IDs in a recovery URL", () => {
    expect(validGenerationId(first)).toBe(true);
    for (const value of [
      undefined,
      "",
      "https://example.com",
      "../another-route",
      first + "/suffix"
    ]) {
      expect(validGenerationId(value)).toBe(false);
    }
  });
});
