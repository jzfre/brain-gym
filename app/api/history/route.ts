import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getConfig } from "@/lib/config";

export const runtime = "nodejs";

const Pagination = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)),
  offset: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(0).max(2_147_483_647))
});

export async function GET(req: Request) {
  const cfg = getConfig();
  const url = new URL(req.url);
  const parsed = Pagination.safeParse({
    limit: url.searchParams.get("limit") ?? "30",
    offset: url.searchParams.get("offset") ?? "0"
  });
  if (!parsed.success) return NextResponse.json({ error: "invalid_pagination" }, { status: 400 });
  const { limit: take, offset: skip } = parsed.data;

  const attempts = await prisma.attempt.findMany({
    where: { userId: cfg.localUserId },
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    take,
    skip,
    include: {
      problem: {
        select: {
          title: true,
          difficulty: true,
          exerciseType: { select: { slug: true, name: true } }
        }
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
