import { randomUUID } from "node:crypto";
import { claimJob, failJob, renewLease, LeaseLostError } from "./store";
import { processJob } from "./handlers";
import { jobContext } from "./context";

function interval(name: string, fallback: number, minimum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > 300_000) {
    throw new Error(`${name} must be an integer between ${minimum} and 300000`);
  }
  return value;
}

type Worker = { tick: () => Promise<void>; timer: ReturnType<typeof setInterval> };
const globalWorker = globalThis as typeof globalThis & { brainGymWorker?: Worker };

// Starts with the Node server, not with a user request. Persisted leases make
// claims safe even if another server process is polling the same database.
export function startWorker(): void {
  if (globalWorker.brainGymWorker || process.env.NEXT_PHASE === "phase-production-build") return;
  const leaseMs = interval("JOB_LEASE_MS", 60_000, 1000);
  const pollMs = interval("JOB_POLL_MS", 1000, 100);
  const running = new Set<string>();
  let polling = false;
  async function tick() {
    if (polling) return;
    polling = true;
    try {
      while (running.size < 4) {
        const job = await claimJob({ leaseMs });
        if (!job) break;
        const token = job.leaseToken!;
        const localId = randomUUID();
        running.add(localId);
        const controller = new AbortController();
        let renewing = false;
        const heartbeat = setInterval(
          async () => {
            if (renewing) return;
            renewing = true;
            try {
              if (!(await renewLease(job.id, token, { leaseMs })))
                controller.abort(new LeaseLostError(job.id));
            } catch (error) {
              // Stop remote work on uncertain ownership; a new lease owner will
              // recover the persisted checkpoint after database connectivity returns.
              controller.abort(error);
            } finally {
              renewing = false;
            }
          },
          Math.floor(leaseMs / 3)
        );
        heartbeat.unref();
        const checkpoint = job.checkpoint as { modelStep?: number } | null;
        void jobContext
          .run(
            {
              id: job.id,
              leaseToken: token,
              nextStep: checkpoint?.modelStep ?? 0,
              signal: controller.signal
            },
            () => processJob(job)
          )
          .catch(async (error) => {
            if (error instanceof LeaseLostError || controller.signal.aborted) return;
            console.error(`[worker] ${job.kind} job ${job.id} failed:`, error);
            try {
              await failJob(job.id, token, "The exercise job failed. Please retry.");
            } catch (failure) {
              if (!(failure instanceof LeaseLostError))
                console.error("[worker] could not persist failure; lease will recover:", failure);
            }
          })
          .finally(() => {
            clearInterval(heartbeat);
            running.delete(localId);
          });
      }
    } catch (error) {
      console.error("[worker] polling failed; will retry:", error);
    } finally {
      polling = false;
    }
  }
  const timer = setInterval(() => {
    void tick();
  }, pollMs);
  timer.unref();
  globalWorker.brainGymWorker = { tick, timer };
  void tick();
}

export function wakeWorker(): void {
  startWorker();
  void globalWorker.brainGymWorker?.tick();
}
