import { AsyncLocalStorage } from "node:async_hooks";

export type JobContext = {
  id: string;
  leaseToken: string;
  nextStep: number;
  signal: AbortSignal;
};
const scope = globalThis as typeof globalThis & {
  brainGymJobContext?: AsyncLocalStorage<JobContext>;
};
export const jobContext = (scope.brainGymJobContext ??= new AsyncLocalStorage<JobContext>());
