import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { getConfig } from "@/lib/config";
import { LsatUserAnswerSchema } from "@/lib/exercises/lsat-logical-reasoning/schemas";

export const runtime = "nodejs";

const Body = z.object({
  problemId: z.string().uuid(),
  clientSubmissionId: z.string().uuid().optional(),
  responseText: z.string().trim().min(1).max(50_000),
  timeSpentSeconds: z.number().int().nonnegative().max(2_147_483_647)
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const cfg = getConfig();
  const { clientSubmissionId } = parsed.data;
  const findSubmission = () =>
    prisma.attempt.findUnique({
      where: {
        userId_clientSubmissionId: {
          userId: cfg.localUserId,
          clientSubmissionId: clientSubmissionId!
        }
      }
    });
  const replay = (attempt: { id: number; problemId: string; responseText: string }) => {
    if (
      attempt.problemId !== parsed.data.problemId ||
      attempt.responseText !== parsed.data.responseText
    ) {
      return NextResponse.json(
        {
          error: "submission_conflict",
          message:
            "This submission was already saved with different content. Open History to review it."
        },
        { status: 409 }
      );
    }
    // Preserve the originally recorded elapsed time: a lost response and retry
    // must not silently replace a completed answer with a later timer value.
    return NextResponse.json({ attemptId: attempt.id });
  };
  if (clientSubmissionId) {
    const existing = await findSubmission();
    if (existing) return replay(existing);
  }

  const problem = await prisma.problem.findUnique({
    where: { id: parsed.data.problemId },
    select: { id: true, exerciseType: { select: { slug: true } }, userVisiblePayload: true }
  });
  if (!problem) return NextResponse.json({ error: "problem_not_found" }, { status: 404 });

  if (problem.exerciseType.slug === "LSAT_LOGICAL_REASONING") {
    let answer: unknown;
    try {
      answer = JSON.parse(parsed.data.responseText);
    } catch {
      return NextResponse.json({ error: "invalid_lsat_answer" }, { status: 400 });
    }
    const submission = LsatUserAnswerSchema.safeParse(answer);
    const payload = problem.userVisiblePayload as { questions?: Array<{ number: number }> };
    const numbers = new Set((payload.questions ?? []).map((question) => question.number));
    if (!submission.success || submission.data.answers.some((item) => !numbers.has(item.number))) {
      return NextResponse.json({ error: "invalid_lsat_answer" }, { status: 400 });
    }
  }

  try {
    const attempt = await prisma.attempt.create({
      data: {
        userId: cfg.localUserId,
        problemId: parsed.data.problemId,
        responseText: parsed.data.responseText,
        timeSpentSeconds: parsed.data.timeSpentSeconds,
        ...(clientSubmissionId ? { clientSubmissionId } : {})
      }
    });
    return NextResponse.json({ attemptId: attempt.id });
  } catch (error) {
    // Two retries can both miss the read above. The database unique constraint
    // arbitrates atomically, so the loser returns the winner's persisted result.
    if (
      clientSubmissionId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await findSubmission();
      if (existing) return replay(existing);
    }
    throw error;
  }
}
