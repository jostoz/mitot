-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MENTION', 'FOLLOW_UP_DUE', 'NEW_DISCUSSION');

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "discussionId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_messageId_key" ON "MediaAsset"("messageId");

-- CreateIndex
CREATE INDEX "Notification_groupId_read_createdAt_idx" ON "Notification"("groupId", "read", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DeckMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WhatsAppGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "DiscussionThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
