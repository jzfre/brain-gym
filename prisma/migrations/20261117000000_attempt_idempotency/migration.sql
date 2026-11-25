-- Optional for existing attempts and older clients. PostgreSQL permits multiple
-- NULL keys while enforcing one persisted result per user/client submission.
ALTER TABLE "Attempt" ADD COLUMN "clientSubmissionId" UUID;
CREATE UNIQUE INDEX "Attempt_userId_clientSubmissionId_key"
ON "Attempt"("userId", "clientSubmissionId");
