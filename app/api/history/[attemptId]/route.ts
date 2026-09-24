import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInFlight } from "@/lib/evaluation/in-flight";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const id = Number(attemptId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  // Checked on both sides of the query, so a run that finishes or starts while
  // it's in progress still counts: a finished run committed its result (or
  // EVAL_FAILED) before leaving the set, and a starting retry is marked before
  // it resets the row. Either way the row read below may be stale, and a lone
  // "not in flight" would make a live or just-finished evaluation look
  // interrupted.
  const inFlightBefore = isInFlight(id);
  const attempt = await prisma.attempt.findUnique({
    where: { id },
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
  const evaluating = inFlightBefore || isInFlight(id);

  return NextResponse.json({
    attempt: {
      id: attempt.id,
      responseText: attempt.responseText,
      timeSpentSeconds: attempt.timeSpentSeconds,
      submittedAt: attempt.submittedAt,
      status: attempt.status
    },
    problem: attempt.problem,
    evaluation: attempt.evaluation,
    // Lets the client tell a running evaluation from one a restart killed.
    evaluating
  });
}
