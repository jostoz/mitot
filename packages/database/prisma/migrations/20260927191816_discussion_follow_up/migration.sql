-- AlterTable
ALTER TABLE "DiscussionThread" ADD COLUMN     "followUpAt" TIMESTAMP(3),
ADD COLUMN     "nextAction" TEXT,
ADD COLUMN     "ownerName" TEXT,
ADD COLUMN     "priority" TEXT;
