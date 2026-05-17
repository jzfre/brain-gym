import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getConfig } from "@/lib/config";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const cfg = getConfig();
  const url = new URL(req.url);
  const take = Math.min(Number(url.searchParams.get("limit") ?? "30"), 100);
  const skip = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);

  const attempts = await prisma.attempt.findMany({
    where: { userId: cfg.localUserId },
    orderBy: { submittedAt: "desc" },
    take,
    skip,
    include: {
      problem: {
        select: { title: true, difficulty: true, exerciseType: { select: { slug: true, name: true } } }
      },
      evaluation: { select: { overallScore: true, shortDiagnosis: true } }
    }
  });

  return NextResponse.json({
    items: attempts.map((a) => ({
      attemptId: a.id,
      problemTitle: a.problem.title,
      difficulty: a.problem.difficulty,
      exerciseSlug: a.problem.exerciseType.slug,
      exerciseName: a.problem.exerciseType.name,
      submittedAt: a.submittedAt,
      status: a.status,
      overallScore: a.evaluation?.overallScore ?? null,
      shortDiagnosis: a.evaluation?.shortDiagnosis ?? null
    }))
  });
}
