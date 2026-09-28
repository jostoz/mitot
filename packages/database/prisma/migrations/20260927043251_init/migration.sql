-- CreateEnum
CREATE TYPE "MessageCategory" AS ENUM ('INCIDENT', 'TASK', 'DECISION', 'KNOWLEDGE', 'GENERAL_CHAT', 'NOISE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phoneJid" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckColumn" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "MessageCategory" NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeckColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckMessage" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "columnId" TEXT,
    "senderJid" TEXT NOT NULL,
    "senderUserId" TEXT,
    "senderName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" "MessageCategory" NOT NULL DEFAULT 'GENERAL_CHAT',
    "parentMessageId" TEXT,
    "metadata" JSONB,
    "isOutbound" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeckMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneJid_key" ON "User"("phoneJid");

-- CreateIndex
CREATE UNIQUE INDEX "DeckColumn_groupId_slug_key" ON "DeckColumn"("groupId", "slug");

-- CreateIndex
CREATE INDEX "DeckMessage_groupId_columnId_createdAt_idx" ON "DeckMessage"("groupId", "columnId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DeckMessage_parentMessageId_idx" ON "DeckMessage"("parentMessageId");

-- AddForeignKey
ALTER TABLE "DeckColumn" ADD CONSTRAINT "DeckColumn_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WhatsAppGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckMessage" ADD CONSTRAINT "DeckMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WhatsAppGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckMessage" ADD CONSTRAINT "DeckMessage_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "DeckColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckMessage" ADD CONSTRAINT "DeckMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
