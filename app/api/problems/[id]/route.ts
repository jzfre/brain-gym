import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid_problem_id" }, { status: 400 });
  }
  const problem = await prisma.problem.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      promptText: true,
      userVisiblePayload: true,
      rubric: true,
      timeboxMinutes: true,
      suggestedPacing: true,
      requiredAnswerSections: true,
      difficulty: true,
      tags: true,
      isNearDuplicate: true,
      nearestSimilarity: true,
      createdAt: true,
      sources: true,
      exerciseType: { select: { slug: true, name: true } }
    }
  });
  if (!problem) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json(problem);
}
