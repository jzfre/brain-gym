-- Enable pgvector (must run before any vector column is created)
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "Problem" ADD COLUMN     "embedding" vector(1536),
ADD COLUMN     "isNearDuplicate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nearestSimilarity" DOUBLE PRECISION;

-- Cosine-distance ANN index for similarity search
CREATE INDEX "problem_embedding_hnsw" ON "Problem" USING hnsw ("embedding" vector_cosine_ops) WHERE "embedding" IS NOT NULL;
