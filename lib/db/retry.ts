import { Prisma } from "@prisma/client";
import { setTimeout as delay } from "node:timers/promises";

// Retry only failures where a fresh database operation can recover. Constraint,
// validation and application errors must surface rather than loop. This helper
// belongs around short atomic persistence operations, never model calls.
const TRANSIENT_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2034"]);
const RETRY_DELAYS_MS = [250, 1000, 3000];

function isTransient(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return TRANSIENT_CODES.has(error.code);
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return TRANSIENT_CODES.has(error.errorCode ?? "");
  }
  return false;
}

export async function retryDatabaseOperation<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransient(error) || attempt >= RETRY_DELAYS_MS.length) throw error;
      await delay(RETRY_DELAYS_MS[attempt]);
    }
  }
}
