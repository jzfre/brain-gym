import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export type SimilarProblem = {
  id: string;
  title: string;
  tags: string[];
  similarity: number;
};

// The ONLY place raw vector SQL lives. Returns the k nearest prior problems of
// the given exercise type by cosine similarity (1 = identical), closest first.
// Degrades to [] on any query error so the caller falls back to hash-only.
export async function findSimilarProblems(args: {
  exerciseTypeId: string;
  embedding: number[];
  k: number;
}): Promise<SimilarProblem[]> {
  const literal = `[${args.embedding.join(",")}]`;
  try {
    const rows = await prisma.$queryRaw<SimilarProblem[]>(Prisma.sql`
      SELECT "id", "title", "tags",
             1 - ("embedding" <=> ${literal}::vector) AS "similarity"
      FROM "Problem"
      WHERE "exerciseTypeId" = ${args.exerciseTypeId}
        AND "embedding" IS NOT NULL
      ORDER BY "embedding" <=> ${literal}::vector
      LIMIT ${args.k}
    `);
    return rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
  } catch {
    return [];
  }
}
