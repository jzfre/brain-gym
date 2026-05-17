import { ExerciseSlug } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export type AvoidanceHint = {
  recentTitles: string[];
  recentTags: string[];
  recentSourceUrls: string[];
  recentHashes: string[];
};

export async function loadAvoidanceHint(args: {
  exerciseSlug: ExerciseSlug;
  limit?: number;
}): Promise<AvoidanceHint> {
  const limit = args.limit ?? 20;
  const exerciseType = await prisma.exerciseType.findUniqueOrThrow({ where: { slug: args.exerciseSlug } });

  const problems = await prisma.problem.findMany({
    where: { exerciseTypeId: exerciseType.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { sources: { select: { url: true } } }
  });

  const recentTitles = problems.map((p) => p.title);
  const recentHashes = problems.map((p) => p.uniquenessHash);
  const tagSet = new Set<string>();
  problems.forEach((p) => p.tags.forEach((t) => tagSet.add(t)));
  const urlSet = new Set<string>();
  problems.forEach((p) => p.sources.forEach((s) => urlSet.add(s.url)));

  return {
    recentTitles,
    recentTags: [...tagSet],
    recentSourceUrls: [...urlSet],
    recentHashes
  };
}
