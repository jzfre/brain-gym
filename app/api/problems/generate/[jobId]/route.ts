import { NextResponse } from "next/server";
import { getJob } from "@/lib/generation/jobs";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = getJob(jobId);
  // Unknown id: pruned, or the process restarted (which also killed the
  // generation it was tracking) — the client offers a retry either way.
  if (!job) return NextResponse.json({ error: "unknown_job" }, { status: 404 });
  return NextResponse.json({
    status: job.status,
    problemId: job.problemId ?? null,
    error: job.error ?? null
  });
}
