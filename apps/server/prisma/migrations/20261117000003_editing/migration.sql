-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('client', 'server');

-- CreateTable
CREATE TABLE "NodeComment" (
    "id" UUID NOT NULL,
    "answerId" UUID NOT NULL,
    "nodeId" TEXT NOT NULL,
    "authorId" UUID NOT NULL,
    "body" VARCHAR(300) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "NodeComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "schemaVersion" SMALLINT NOT NULL,
    "type" TEXT NOT NULL,
    "creatorId" UUID NOT NULL,
    "sessionId" UUID,
    "projectId" UUID,
    "setId" UUID,
    "answerId" UUID,
    "payload" JSONB NOT NULL,
    "clientTs" TIMESTAMPTZ(3),
    "serverTs" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "EventSource" NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NodeComment_answerId_deletedAt_idx" ON "NodeComment"("answerId", "deletedAt");

-- CreateIndex
CREATE INDEX "NodeComment_authorId_idx" ON "NodeComment"("authorId");

-- CreateIndex
CREATE INDEX "Event_creatorId_serverTs_idx" ON "Event"("creatorId", "serverTs");

-- CreateIndex
CREATE INDEX "Event_projectId_idx" ON "Event"("projectId");

-- AddForeignKey
ALTER TABLE "NodeComment" ADD CONSTRAINT "NodeComment_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeComment" ADD CONSTRAINT "NodeComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DemoSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_setId_fkey" FOREIGN KEY ("setId") REFERENCES "PromptSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 이벤트 봉투 버전은 1 이상.
ALTER TABLE "Event" ADD CONSTRAINT "Event_schemaVersion_check" CHECK ("schemaVersion" >= 1);
