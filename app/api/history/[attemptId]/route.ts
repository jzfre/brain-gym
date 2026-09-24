import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInFlight } from "@/lib/evaluation/in-flight";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const id = Number(attemptId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  // Read before the query: a run commits its result (or EVAL_FAILED) before it
  // leaves the set, so "not in flight" here guarantees the read below sees the
  // final state. Reading after could pair a stale row with a just-cleared flag
  // and make a finished evaluation look interrupted.
  const evaluating = isInFlight(id);
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
