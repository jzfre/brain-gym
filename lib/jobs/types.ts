import type { BackgroundJob, BackgroundJobKind, Prisma } from "@prisma/client";

export type { BackgroundJob, BackgroundJobKind } from "@prisma/client";
export type EnqueueJobInput = {
  kind: BackgroundJobKind;
  userId: string;
  payload: Prisma.InputJsonValue;
  dedupeKey?: string;
};
export type JobLease = Pick<BackgroundJob, "id" | "leaseToken">;
export type LeaseOptions = { leaseMs?: number };
export type ClaimOptions = LeaseOptions & { maxAttempts?: number };
export type JobTransaction = Prisma.TransactionClient;

export class JobCapacityError extends Error {
  constructor(public readonly kind: BackgroundJobKind) {
    super(`Two ${kind.toLowerCase()} jobs are already pending. Please retry shortly.`);
    this.name = "JobCapacityError";
  }
}

export class LeaseLostError extends Error {
  constructor(public readonly jobId: string) {
    super(`The lease for background job ${jobId} expired or was replaced.`);
    this.name = "LeaseLostError";
  }
}

export class JobConflictError extends Error {
  constructor() {
    super("This job request was already submitted with different options.");
    this.name = "JobConflictError";
  }
}
