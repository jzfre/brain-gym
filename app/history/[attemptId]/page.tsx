import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AttemptDetailPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const id = Number(attemptId);
  if (!Number.isInteger(id)) notFound();

  const attempt = await prisma.attempt.findUnique({
    where: { id },
    include: {
      problem: { include: { exerciseType: true } },
      evaluation: { include: { dimensions: true } }
    }
  });
  if (!attempt) notFound();

  const payload = attempt.problem.userVisiblePayload as { userVisiblePrompt: string };

  return (
    <main className="container mx-auto max-w-3xl space-y-6 py-8">
      <Link href="/history" className="text-sm text-muted-foreground hover:underline">
        ← back to history
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>{attempt.problem.title}</CardTitle>
          <div className="flex gap-2 pt-1">
            <Badge variant="outline">{attempt.problem.exerciseType.name}</Badge>
            <Badge variant="outline">{attempt.problem.difficulty.toLowerCase()}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <article className="prose prose-sm max-w-none whitespace-pre-wrap">
            {payload.userVisiblePrompt}
          </article>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your answer</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-sm">{attempt.responseText}</pre>
        </CardContent>
      </Card>

      {attempt.evaluation ? (
        <Card>
          <CardHeader>
            <CardTitle>Evaluation — {attempt.evaluation.overallScore.toFixed(1)} / 10</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>{attempt.evaluation.shortDiagnosis}</p>
            <Separator />
            <ul className="space-y-2">
              {attempt.evaluation.dimensions.map((d) => (
                <li key={d.id} className="rounded-md border p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium">{d.dimension}</span>
                    <span className="font-mono text-sm">{d.score}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{d.rationale}</p>
                </li>
              ))}
            </ul>
            <Separator />
            <section>
              <h3 className="mb-1 text-sm font-semibold uppercase text-muted-foreground">Summary</h3>
              <p className="text-sm">{attempt.evaluation.summary}</p>
            </section>
            <section>
              <h3 className="mb-1 text-sm font-semibold uppercase text-muted-foreground">Next rep</h3>
              <p className="text-sm">{attempt.evaluation.nextRep}</p>
            </section>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">No evaluation stored.</p>
      )}
    </main>
  );
}
