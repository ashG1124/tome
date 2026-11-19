-- AlterTable
ALTER TABLE "Answer" ADD COLUMN     "acceptedAt" TIMESTAMPTZ(3);

-- 기존 확정 답변은 생성 시각을 확정 시각으로 채운다.
UPDATE "Answer" SET "acceptedAt" = "createdAt" WHERE "status" = 'accepted';
