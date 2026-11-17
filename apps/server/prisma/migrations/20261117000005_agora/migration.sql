-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "topicId" UUID;

-- CreateTable
CREATE TABLE "AgoraComment" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" VARCHAR(300) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),
    "hiddenAt" TIMESTAMPTZ(3),

    CONSTRAINT "AgoraComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStat" (
    "projectId" UUID NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "deriveCount" INTEGER NOT NULL DEFAULT 0,
    "remixCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProjectStat_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "seedOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgoraComment_projectId_createdAt_idx" ON "AgoraComment"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AgoraComment_authorId_idx" ON "AgoraComment"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_seedOrder_key" ON "Topic"("seedOrder");

-- CreateIndex
CREATE INDEX "Project_topicId_idx" ON "Project"("topicId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgoraComment" ADD CONSTRAINT "AgoraComment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgoraComment" ADD CONSTRAINT "AgoraComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStat" ADD CONSTRAINT "ProjectStat_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
