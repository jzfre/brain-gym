import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const id = Number(attemptId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

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
    evaluation: attempt.evaluation
  });
}
