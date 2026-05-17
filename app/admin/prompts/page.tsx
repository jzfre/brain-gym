import { prisma } from "@/lib/db/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminPromptsPage() {
  const rows = await prisma.promptVersion.findMany({
    where: { active: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: { exerciseType: { select: { slug: true } } }
  });

  return (
    <main className="container mx-auto max-w-3xl space-y-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Active prompts</h1>
      {rows.map((p) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>{p.name}</span>
              <div className="flex gap-2">
                <Badge variant="outline">{p.role.toLowerCase()}</Badge>
                {p.exerciseType ? <Badge variant="outline">{p.exerciseType.slug.toLowerCase()}</Badge> : null}
                <Badge>v{p.version}</Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{p.content}</pre>
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
