import { notFound } from "next/navigation";
import { z } from "zod";
import { ExercisePicker, type ProblemPayload } from "@/components/today/exercise-picker";
import { prisma } from "@/lib/db/client";

export default async function TodayPage({
  searchParams
}: {
  searchParams: Promise<{ problemId?: string | string[] }>;
}) {
  const { problemId } = await searchParams;
  let initialProblem: ProblemPayload | null = null;
  if (problemId !== undefined) {
    const parsed = z.string().uuid().safeParse(problemId);
    if (!parsed.success) notFound();
    const saved = await prisma.problem.findUnique({
      where: { id: parsed.data },
      select: { id: true, userVisiblePayload: true, exerciseType: { select: { slug: true } } }
    });
    if (!saved) notFound();
    initialProblem = {
      id: saved.id,
      slug: saved.exerciseType.slug,
      userVisiblePayload: saved.userVisiblePayload as ProblemPayload["userVisiblePayload"]
    };
  }
  return (
    <main className="container mx-auto max-w-3xl py-8">
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">Today</h1>
      <ExercisePicker key={initialProblem?.id ?? "new"} initialProblem={initialProblem} />
    </main>
  );
}
