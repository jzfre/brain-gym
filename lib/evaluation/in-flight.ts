// Attempts whose evaluation is running in this process. The evaluate route
// adds to it (so a duplicate POST can't start a second model call) and the
// history route reads it (so the client can tell a running evaluation from one
// a restart killed). Lives in process memory: the production container is a
// single long-lived Node process, and a restart empties the set exactly when
// it kills the runs it tracked. Kept on globalThis (like the Prisma client)
// because `next dev` re-evaluates server modules after every compile — a
// module-level Set would reset under a running evaluation and report it as
// interrupted.
const globalForEval = globalThis as unknown as { evalInFlight?: Set<number> };
const inFlight = (globalForEval.evalInFlight ??= new Set<number>());

export function markInFlight(attemptId: number): void {
  inFlight.add(attemptId);
}

export function clearInFlight(attemptId: number): void {
  inFlight.delete(attemptId);
}

export function isInFlight(attemptId: number): boolean {
  return inFlight.has(attemptId);
}
