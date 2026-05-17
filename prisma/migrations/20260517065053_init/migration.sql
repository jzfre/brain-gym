-- CreateEnum
CREATE TYPE "ExerciseSlug" AS ENUM ('MEMO_EXTRACTION', 'INCIDENT_RESPONSE', 'LSAT_LOGICAL_REASONING');

-- CreateEnum
CREATE TYPE "PromptRole" AS ENUM ('BASE', 'GENERATOR', 'EVALUATOR', 'WEEKLY_REVIEW');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('SUBMITTED', 'EVALUATED', 'EVAL_FAILED');

-- CreateEnum
CREATE TYPE "ModelRunPurpose" AS ENUM ('GENERATE_PROBLEM', 'EVALUATE_ATTEMPT');

-- CreateEnum
CREATE TYPE "ModelRunStatus" AS ENUM ('PENDING', 'COMPLETED', 'ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseType" (
    "id" TEXT NOT NULL,
    "slug" "ExerciseSlug" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ExerciseType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "PromptRole" NOT NULL,
    "exerciseTypeId" TEXT,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Problem" (
    "id" TEXT NOT NULL,
    "exerciseTypeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "userVisiblePayload" JSONB NOT NULL,
    "hiddenAnswerKey" JSONB NOT NULL,
    "rubric" JSONB NOT NULL,
    "timeboxMinutes" INTEGER NOT NULL,
    "suggestedPacing" JSONB NOT NULL,
    "requiredAnswerSections" JSONB NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceKind" TEXT NOT NULL DEFAULT 'generated',
    "uniquenessHash" TEXT NOT NULL,
    "generatedByModel" TEXT NOT NULL,
    "generationPromptVersionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemSource" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "publisher" TEXT,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "citationPayload" JSONB,

    CONSTRAINT "ProblemSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "responseText" TEXT NOT NULL,
    "timeSpentSeconds" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AttemptStatus" NOT NULL DEFAULT 'SUBMITTED',

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "attemptId" INTEGER NOT NULL,
    "evaluatorPromptVersionId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "shortDiagnosis" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "topFixes" JSONB NOT NULL,
    "rewriteSuggestions" JSONB NOT NULL,
    "strongAnswerSketch" TEXT,
    "nextRep" TEXT NOT NULL,
    "clarificationQuestion" TEXT,
    "errorPatternTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "missClassifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rawOutput" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationDimension" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rationale" TEXT NOT NULL,

    CONSTRAINT "EvaluationDimension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelRun" (
    "id" TEXT NOT NULL,
    "purpose" "ModelRunPurpose" NOT NULL,
    "model" TEXT NOT NULL,
    "requestPayload" JSONB NOT NULL,
    "responsePayload" JSONB,
    "usagePayload" JSONB,
    "status" "ModelRunStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseType_slug_key" ON "ExerciseType"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_role_exerciseTypeId_version_key" ON "PromptVersion"("role", "exerciseTypeId", "version");

-- CreateIndex
CREATE INDEX "Problem_createdAt_idx" ON "Problem"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Problem_exerciseTypeId_uniquenessHash_key" ON "Problem"("exerciseTypeId", "uniquenessHash");

-- CreateIndex
CREATE INDEX "Attempt_userId_submittedAt_idx" ON "Attempt"("userId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_attemptId_key" ON "Evaluation"("attemptId");

-- AddForeignKey
ALTER TABLE "PromptVersion" ADD CONSTRAINT "PromptVersion_exerciseTypeId_fkey" FOREIGN KEY ("exerciseTypeId") REFERENCES "ExerciseType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_exerciseTypeId_fkey" FOREIGN KEY ("exerciseTypeId") REFERENCES "ExerciseType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_generationPromptVersionId_fkey" FOREIGN KEY ("generationPromptVersionId") REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemSource" ADD CONSTRAINT "ProblemSource_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_evaluatorPromptVersionId_fkey" FOREIGN KEY ("evaluatorPromptVersionId") REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationDimension" ADD CONSTRAINT "EvaluationDimension_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
