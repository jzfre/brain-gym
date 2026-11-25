import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getConfig } from "@/lib/config";
import { getEvaluationJob } from "@/lib/jobs/store";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const id = Number(attemptId);
  if (!/^[1-9]\d*$/.test(attemptId) || !Number.isSafeInteger(id) || id > 2_147_483_647)
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const userId = getConfig().localUserId;
  const before = await getEvaluationJob(id, userId);
  const attempt = await prisma.attempt.findUnique({
    where: { id, userId },
    include: {
      problem: {
        select: {
          id: true,
          title: true,
          difficulty: true,
          userVisiblePayload: true,
          exerciseType: { select: { slug: true, name: true } }
        }
      },
      evaluation: { include: { dimensions: true } }
    }
  });
  if (!attempt) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const after = await getEvaluationJob(id, userId);
  const active = (status?: string) => status === "QUEUED" || status === "RUNNING";
  const evaluating = active(before?.status) || active(after?.status);

  return NextResponse.json({
    attempt: {
      id: attempt.id,
      responseText: attempt.responseText,
      timeSpentSeconds: attempt.timeSpentSeconds,
      submittedAt: attempt.submittedAt,
      status: after?.status === "FAILED" && !attempt.evaluation ? "EVAL_FAILED" : attempt.status
    },
    problem: attempt.problem,
    evaluation: attempt.evaluation,
    // Queued and lease-recovering work remains active across server restarts.
    evaluating
  });
}
