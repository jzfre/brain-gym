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
  // k is always an integer from config; guard defensively (a non-integer LIMIT
  // would error and be silently swallowed below).
  if (!Number.isInteger(args.k) || args.k < 1) return [];
  // pgvector has no wire-protocol param type, so the vector is rendered to its
  // text form "[v1,v2,...]" and passed as a BOUND PARAMETER via the Prisma.sql
  // ${literal} interpolation below (compiles to `$1::vector`, not concatenated
  // into SQL). Safe: embeddings are numeric floats and never touch the SQL text.
  const literal = `[${args.embedding.join(",")}]`;
  try {
    // Compute the distance once in the subquery (HNSW index serves
    // `ORDER BY dist LIMIT k`), then derive similarity in the outer select.
    const rows = await prisma.$queryRaw<SimilarProblem[]>(Prisma.sql`
      SELECT "id", "title", "tags", 1 - "dist" AS "similarity"
      FROM (
        SELECT "id", "title", "tags",
               "embedding" <=> ${literal}::vector AS "dist"
        FROM "Problem"
        WHERE "exerciseTypeId" = ${args.exerciseTypeId}
          AND "embedding" IS NOT NULL
        ORDER BY "dist"
        LIMIT ${args.k}
      ) sub
      ORDER BY "similarity" DESC
    `);
    return rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
  } catch (err) {
    console.error("[findSimilarProblems] query failed, falling back to []:", err);
    return [];
  }
}
