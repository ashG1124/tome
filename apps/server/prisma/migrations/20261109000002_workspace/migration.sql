-- CreateEnum
CREATE TYPE "ProjectKind" AS ENUM ('original', 'derive');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('building', 'finished');

-- CreateEnum
CREATE TYPE "AnswerStatus" AS ENUM ('draft', 'accepted', 'discarded');

-- CreateEnum
CREATE TYPE "AnswerOrigin" AS ENUM ('generated', 'edited', 'sample', 'derived_copy', 'seed');

-- CreateEnum
CREATE TYPE "ImageMode" AS ENUM ('generate', 'edit');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('create', 'revise');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "kind" "ProjectKind" NOT NULL,
    "title" VARCHAR(60) NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'building',
    "finishedAt" TIMESTAMPTZ(3),
    "postedAt" TIMESTAMPTZ(3),
    "coverAnswerId" UUID,
    "selectionReason" VARCHAR(300),
    "derivedFromProjectId" UUID,
    "derivedFromAnswerId" UUID,
    "remixPartnerId" UUID,
    "shelfPosition" INTEGER NOT NULL,
    "lastEditedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),
    "hiddenAt" TIMESTAMPTZ(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptSet" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "prompt" VARCHAR(500) NOT NULL,
    "presetKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" UUID NOT NULL,
    "setId" UUID NOT NULL,
    "status" "AnswerStatus" NOT NULL,
    "number" INTEGER,
    "baseAnswerId" UUID,
    "jobId" UUID,
    "origin" "AnswerOrigin" NOT NULL,
    "imageKey" TEXT NOT NULL,
    "thumbKey" TEXT,
    "editInputKey" TEXT,
    "imageMode" "ImageMode" NOT NULL,
    "editInstruction" TEXT,
    "assembledPrompt" VARCHAR(2048) NOT NULL,
    "phrases" JSONB NOT NULL,
    "excluded" JSONB NOT NULL,
    "nodes" JSONB NOT NULL,
    "verification" JSONB,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "sampleResultId" UUID,
    "copiedFromAnswerId" UUID,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "setId" UUID NOT NULL,
    "kind" "JobKind" NOT NULL,
    "baseAnswerId" UUID,
    "requestedNodes" JSONB,
    "appliedConnectionIds" UUID[],
    "startStage" TEXT NOT NULL,
    "nextStage" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'pending',
    "resultAnswerId" UUID,
    "errorCode" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdBySessionId" UUID NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobStep" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'pending',
    "attempt" SMALLINT NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMPTZ(3),
    "provider" TEXT,
    "model" TEXT,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER,
    "neuronsEst" DECIMAL(12,4),
    "errorCode" TEXT,
    "output" JSONB,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "JobStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageDaily" (
    "date" DATE NOT NULL,
    "textCalls" INTEGER NOT NULL DEFAULT 0,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "fallbackCount" INTEGER NOT NULL DEFAULT 0,
    "neuronsEst" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "costUsdEst" DECIMAL(10,4) NOT NULL DEFAULT 0,

    CONSTRAINT "UsageDaily_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "SampleResult" (
    "id" UUID NOT NULL,
    "scenarioKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "promptVariants" JSONB NOT NULL,
    "nodes" JSONB NOT NULL,
    "verification" JSONB,
    "imageKey" TEXT NOT NULL,
    "thumbKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SampleResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_ownerId_deletedAt_shelfPosition_idx" ON "Project"("ownerId", "deletedAt", "shelfPosition");

-- CreateIndex
CREATE INDEX "Project_derivedFromProjectId_idx" ON "Project"("derivedFromProjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Page_projectId_index_key" ON "Page"("projectId", "index");

-- CreateIndex
CREATE INDEX "PromptSet_projectId_idx" ON "PromptSet"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PromptSet_pageId_position_key" ON "PromptSet"("pageId", "position");

-- CreateIndex
CREATE INDEX "Answer_setId_pinned_idx" ON "Answer"("setId", "pinned");

-- CreateIndex
CREATE INDEX "GenerationJob_createdBySessionId_createdAt_idx" ON "GenerationJob"("createdBySessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_createdBySessionId_idempotencyKey_key" ON "GenerationJob"("createdBySessionId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "JobStep_jobId_stage_key" ON "JobStep"("jobId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "SampleResult_scenarioKey_key" ON "SampleResult"("scenarioKey");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_remixPartnerId_fkey" FOREIGN KEY ("remixPartnerId") REFERENCES "Creator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_coverAnswerId_fkey" FOREIGN KEY ("coverAnswerId") REFERENCES "Answer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_derivedFromAnswerId_fkey" FOREIGN KEY ("derivedFromAnswerId") REFERENCES "Answer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_derivedFromProjectId_fkey" FOREIGN KEY ("derivedFromProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptSet" ADD CONSTRAINT "PromptSet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptSet" ADD CONSTRAINT "PromptSet_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_setId_fkey" FOREIGN KEY ("setId") REFERENCES "PromptSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_baseAnswerId_fkey" FOREIGN KEY ("baseAnswerId") REFERENCES "Answer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_copiedFromAnswerId_fkey" FOREIGN KEY ("copiedFromAnswerId") REFERENCES "Answer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_sampleResultId_fkey" FOREIGN KEY ("sampleResultId") REFERENCES "SampleResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_setId_fkey" FOREIGN KEY ("setId") REFERENCES "PromptSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_createdBySessionId_fkey" FOREIGN KEY ("createdBySessionId") REFERENCES "DemoSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStep" ADD CONSTRAINT "JobStep_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 아래는 Prisma 스키마로 표현할 수 없는 제약이다.

-- 페이지당 세트는 position 1~3 세 개까지
ALTER TABLE "PromptSet" ADD CONSTRAINT "PromptSet_position_check"
  CHECK ("position" BETWEEN 1 AND 3);

-- 프로젝트당 페이지는 index 0~9 열 개까지
ALTER TABLE "Page" ADD CONSTRAINT "Page_index_check"
  CHECK ("index" BETWEEN 0 AND 9);

-- 같은 세트 안에서 확정 번호는 한 번만 쓴다(번호가 없는 draft 는 제외)
CREATE UNIQUE INDEX "Answer_setId_number_key" ON "Answer"("setId", "number")
  WHERE "number" IS NOT NULL;

-- 프로젝트당 진행 중인 job 은 하나만
CREATE UNIQUE INDEX "GenerationJob_projectId_active_key" ON "GenerationJob"("projectId")
  WHERE "status" IN ('pending', 'running');
