-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('shown', 'applied', 'dismissed');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "remixPartnerSnapshotId" UUID;

-- CreateTable
CREATE TABLE "IdentitySnapshot" (
    "id" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "algoVersion" TEXT NOT NULL,
    "axes" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "projectCount" INTEGER NOT NULL,
    "provisional" BOOLEAN NOT NULL,
    "computedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IdentitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" UUID NOT NULL,
    "answerId" UUID NOT NULL,
    "nodeId" TEXT NOT NULL,
    "partnerId" UUID NOT NULL,
    "partnerSnapshotId" UUID NOT NULL,
    "predictedAction" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "evidenceCount" INTEGER NOT NULL,
    "evidenceTotal" INTEGER NOT NULL,
    "axis" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'shown',
    "appliedInAnswerId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "creatorId" UUID NOT NULL,
    "targetCreatorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("creatorId","targetCreatorId")
);

-- CreateIndex
CREATE INDEX "IdentitySnapshot_creatorId_computedAt_idx" ON "IdentitySnapshot"("creatorId", "computedAt");

-- CreateIndex
CREATE INDEX "Connection_partnerId_idx" ON "Connection"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_answerId_nodeId_partnerId_key" ON "Connection"("answerId", "nodeId", "partnerId");

-- CreateIndex
CREATE INDEX "Favorite_targetCreatorId_idx" ON "Favorite"("targetCreatorId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_remixPartnerSnapshotId_fkey" FOREIGN KEY ("remixPartnerSnapshotId") REFERENCES "IdentitySnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentitySnapshot" ADD CONSTRAINT "IdentitySnapshot_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_partnerSnapshotId_fkey" FOREIGN KEY ("partnerSnapshotId") REFERENCES "IdentitySnapshot"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_appliedInAnswerId_fkey" FOREIGN KEY ("appliedInAnswerId") REFERENCES "Answer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_targetCreatorId_fkey" FOREIGN KEY ("targetCreatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 즐겨찾기는 자기 자신을 가리킬 수 없다.
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_self_check" CHECK ("creatorId" <> "targetCreatorId");
