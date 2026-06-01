import { prisma } from "@/lib/db/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminProblemsPage() {
  const rows = await prisma.problem.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      difficulty: true,
      isNearDuplicate: true,
      nearestSimilarity: true,
      createdAt: true,
      exerciseType: { select: { name: true } }
    }
  });

  return (
    <main className="container mx-auto max-w-3xl space-y-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Recent problems</h1>
      <p className="text-sm text-muted-foreground">
        Newest 50. The score is the cosine similarity to the closest prior problem at creation
        time (higher means more similar). A near-dup flag means the retry budget was exhausted and
        the least-similar candidate was saved anyway.
      </p>
      {rows.length === 0 ? <p className="text-muted-foreground">No problems yet.</p> : null}
      {rows.map((p) => (
        <Card key={p.id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-baseline justify-between text-base">
              <span>{p.title}</span>
              <span className="font-mono text-sm">
                {p.nearestSimilarity != null ? p.nearestSimilarity.toFixed(3) : "—"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 pb-4 text-sm text-muted-foreground">
            <Badge variant="outline">{p.exerciseType.name}</Badge>
            <Badge variant="outline">{p.difficulty.toLowerCase()}</Badge>
            {p.isNearDuplicate ? <Badge variant="destructive">near-dup</Badge> : null}
            <span className="ml-auto">{new Date(p.createdAt).toLocaleString()}</span>
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
