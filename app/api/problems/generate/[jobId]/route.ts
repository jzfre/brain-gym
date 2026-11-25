import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/store";
import { getConfig } from "@/lib/config";
export const runtime = "nodejs";
export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getJob(jobId, getConfig().localUserId);
  if (!job || job.kind !== "GENERATION")
    return NextResponse.json({ error: "unknown_job" }, { status: 404 });
  return NextResponse.json(
    {
      status:
        job.status === "SUCCEEDED" ? "succeeded" : job.status === "FAILED" ? "failed" : "pending",
      problemId: (job.result as { problemId?: string } | null)?.problemId ?? null,
      error: job.error ?? null
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
