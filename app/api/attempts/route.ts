import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getConfig } from "@/lib/config";

export const runtime = "nodejs";

const Body = z.object({
  problemId: z.string().uuid(),
  responseText: z.string().min(1),
  timeSpentSeconds: z.number().int().nonnegative()
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const cfg = getConfig();
  const attempt = await prisma.attempt.create({
    data: {
      userId: cfg.localUserId,
      problemId: parsed.data.problemId,
      responseText: parsed.data.responseText,
      timeSpentSeconds: parsed.data.timeSpentSeconds
    }
  });
  return NextResponse.json({ attemptId: attempt.id });
}
