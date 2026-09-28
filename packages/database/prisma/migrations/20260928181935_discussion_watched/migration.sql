-- AlterTable
ALTER TABLE "DiscussionThread" ADD COLUMN     "watched" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "DiscussionThread_groupId_watched_idx" ON "DiscussionThread"("groupId", "watched");
