import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { getConfig } from "@/lib/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const cfg = getConfig();
  const attempts = await prisma.attempt.findMany({
    where: { userId: cfg.localUserId },
    orderBy: { submittedAt: "desc" },
    take: 50,
    include: {
      problem: { select: { title: true, difficulty: true, isNearDuplicate: true, exerciseType: { select: { name: true } } } },
      evaluation: { select: { overallScore: true } }
    }
  });

  return (
    <main className="container mx-auto max-w-3xl py-8">
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">History</h1>
      <div className="space-y-3">
        {attempts.length === 0 ? <p className="text-muted-foreground">No attempts yet.</p> : null}
        {attempts.map((a) => (
          <Card key={a.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-baseline justify-between text-base">
                <Link href={`/history/${a.id}`} className="hover:underline">
                  {a.problem.title}
                </Link>
                <span className="font-mono text-sm">
                  {a.evaluation?.overallScore != null ? a.evaluation.overallScore.toFixed(1) : "—"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2 pb-4 text-sm text-muted-foreground">
              <Badge variant="outline">{a.problem.exerciseType.name}</Badge>
              <Badge variant="outline">{a.problem.difficulty.toLowerCase()}</Badge>
              {a.problem.isNearDuplicate ? <Badge variant="destructive">near-dup</Badge> : null}
              <Badge variant={a.status === "EVAL_FAILED" ? "destructive" : "secondary"}>
                {a.status.toLowerCase()}
              </Badge>
              <span className="ml-auto">{new Date(a.submittedAt).toLocaleString()}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
