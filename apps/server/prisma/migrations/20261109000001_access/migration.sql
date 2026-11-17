-- CreateEnum
CREATE TYPE "CreatorKind" AS ENUM ('seed', 'persona', 'visitor');

-- CreateEnum
CREATE TYPE "AccessTarget" AS ENUM ('visitor_pool', 'creator');

-- CreateTable
CREATE TABLE "Creator" (
    "id" UUID NOT NULL,
    "kind" "CreatorKind" NOT NULL,
    "displayName" VARCHAR(40) NOT NULL,
    "bio" VARCHAR(120),
    "avatarKey" TEXT,
    "identityPublic" BOOLEAN NOT NULL DEFAULT true,
    "seedOrder" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Creator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessCode" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "target" "AccessTarget" NOT NULL,
    "creatorId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoSession" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "creatorId" UUID NOT NULL,
    "accessCodeId" UUID NOT NULL,
    "ipHash" TEXT,
    "userAgent" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DemoSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "noticeVersion" TEXT NOT NULL,
    "agreedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "sessionId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("sessionId","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Creator_seedOrder_key" ON "Creator"("seedOrder");

-- CreateIndex
CREATE INDEX "Creator_kind_idx" ON "Creator"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "DemoSession_tokenHash_key" ON "DemoSession"("tokenHash");

-- CreateIndex
CREATE INDEX "DemoSession_creatorId_idx" ON "DemoSession"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRecord_sessionId_noticeVersion_key" ON "ConsentRecord"("sessionId", "noticeVersion");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_createdAt_idx" ON "IdempotencyRecord"("createdAt");

-- AddForeignKey
ALTER TABLE "AccessCode" ADD CONSTRAINT "AccessCode_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoSession" ADD CONSTRAINT "DemoSession_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoSession" ADD CONSTRAINT "DemoSession_accessCodeId_fkey" FOREIGN KEY ("accessCodeId") REFERENCES "AccessCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DemoSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 코드 대상이 creator 일 때만 creatorId 가 있어야 한다(Prisma 스키마로 표현할 수 없는 제약).
ALTER TABLE "AccessCode" ADD CONSTRAINT "AccessCode_target_creator_check"
  CHECK (("target" = 'creator') = ("creatorId" IS NOT NULL));
