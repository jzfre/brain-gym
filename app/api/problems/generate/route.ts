import { NextResponse } from "next/server";
import { z } from "zod";
import { Difficulty, ExerciseSlug } from "@prisma/client";
import { enqueueJob, JobCapacityError, JobConflictError } from "@/lib/jobs/store";
import { getConfig } from "@/lib/config";
import { wakeWorker } from "@/lib/jobs/worker";

export const runtime = "nodejs";
const Body = z.object({
  exerciseSlug: z.nativeEnum(ExerciseSlug),
  difficulty: z.nativeEnum(Difficulty),
  clientGenerationId: z.string().uuid().optional()
});
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const job = await enqueueJob({
      kind: "GENERATION",
      userId: getConfig().localUserId,
      payload: { exerciseSlug: parsed.data.exerciseSlug, difficulty: parsed.data.difficulty },
      dedupeKey: parsed.data.clientGenerationId
    });
    wakeWorker();
    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch (error) {
    if (error instanceof JobConflictError)
      return NextResponse.json(
        {
          error: "generation_conflict",
          message: "This generation request was already used with different settings."
        },
        { status: 409 }
      );
    if (error instanceof JobCapacityError)
      return NextResponse.json(
        {
          error: "generation_busy",
          message: "Two generations are already queued or running. Please retry shortly."
        },
        { status: 429, headers: { "Retry-After": "10" } }
      );
    throw error;
  }
}
