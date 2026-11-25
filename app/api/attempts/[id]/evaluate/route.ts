import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getConfig } from "@/lib/config";
import { enqueueJob, JobCapacityError } from "@/lib/jobs/store";
import { wakeWorker } from "@/lib/jobs/worker";

export const runtime = "nodejs";
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attemptId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(attemptId) || attemptId > 2_147_483_647) {
    return NextResponse.json({ error: "invalid_attempt_id" }, { status: 400 });
  }
  const userId = getConfig().localUserId;
  const existing = await prisma.attempt.findUnique({
    where: { id: attemptId, userId },
    include: { evaluation: true }
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (existing.evaluation)
    return NextResponse.json({ status: "evaluated", evaluationId: existing.evaluation.id });
  try {
    const job = await enqueueJob({
      kind: "EVALUATION",
      userId,
      payload: { attemptId },
      dedupeKey: String(attemptId)
    });
    wakeWorker();
    return NextResponse.json({ status: "evaluating", jobId: job.id }, { status: 202 });
  } catch (error) {
    if (error instanceof JobCapacityError)
      return NextResponse.json(
        {
          error: "evaluation_busy",
          message: "Two evaluations are already queued or running. Please retry shortly."
        },
        { status: 429, headers: { "Retry-After": "10" } }
      );
    throw error;
  }
}
