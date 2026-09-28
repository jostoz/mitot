-- CreateEnum
CREATE TYPE "DiscussionStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'RESOLVED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "DeckMessage" ADD COLUMN     "discussionId" TEXT;

-- CreateTable
CREATE TABLE "DiscussionThread" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "topicKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "DiscussionStatus" NOT NULL DEFAULT 'ACTIVE',
    "tags" JSONB,
    "summary" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscussionThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscussionThread_groupId_status_lastActivityAt_idx" ON "DiscussionThread"("groupId", "status", "lastActivityAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "DiscussionThread_groupId_topicKey_key" ON "DiscussionThread"("groupId", "topicKey");

-- CreateIndex
CREATE INDEX "DeckMessage_discussionId_createdAt_idx" ON "DeckMessage"("discussionId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "DiscussionThread" ADD CONSTRAINT "DiscussionThread_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WhatsAppGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckMessage" ADD CONSTRAINT "DeckMessage_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "DiscussionThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
