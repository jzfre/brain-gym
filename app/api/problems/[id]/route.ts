import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const problem = await prisma.problem.findUnique({
    where: { id },
    include: { sources: true, exerciseType: { select: { slug: true, name: true } } }
  });
  if (!problem) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { hiddenAnswerKey: _hidden, ...rest } = problem;
  return NextResponse.json(rest);
}
