CREATE TYPE "BackgroundJobKind" AS ENUM ('GENERATION', 'EVALUATION');
CREATE TYPE "BackgroundJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "BackgroundJob" (
    "id" UUID NOT NULL,
    "kind" "BackgroundJobKind" NOT NULL,
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'QUEUED',
    "userId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "checkpoint" JSONB,
    "result" JSONB,
    "error" TEXT,
    "dedupeKey" TEXT,
    "leaseToken" UUID,
    "leaseExpiresAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BackgroundJob_userId_kind_dedupeKey_key" ON "BackgroundJob"("userId", "kind", "dedupeKey");
CREATE INDEX "BackgroundJob_status_leaseExpiresAt_createdAt_idx" ON "BackgroundJob"("status", "leaseExpiresAt", "createdAt");
CREATE INDEX "BackgroundJob_userId_kind_createdAt_idx" ON "BackgroundJob"("userId", "kind", "createdAt");
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ModelRun" ADD COLUMN "backgroundJobId" UUID, ADD COLUMN "jobStep" INTEGER;
CREATE UNIQUE INDEX "ModelRun_backgroundJobId_jobStep_key" ON "ModelRun"("backgroundJobId", "jobStep");
ALTER TABLE "ModelRun" ADD CONSTRAINT "ModelRun_backgroundJobId_fkey" FOREIGN KEY ("backgroundJobId") REFERENCES "BackgroundJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
