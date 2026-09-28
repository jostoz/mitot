-- CreateTable
CREATE TABLE "MatchDecision" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "category" "MessageCategory" NOT NULL,
    "matchedThreadId" TEXT,
    "isNewTopic" BOOLEAN NOT NULL,
    "confidence" DOUBLE PRECISION,
    "candidateCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchDecision_messageId_key" ON "MatchDecision"("messageId");

-- CreateIndex
CREATE INDEX "MatchDecision_groupId_createdAt_idx" ON "MatchDecision"("groupId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MatchDecision_promptVersion_idx" ON "MatchDecision"("promptVersion");

-- AddForeignKey
ALTER TABLE "MatchDecision" ADD CONSTRAINT "MatchDecision_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WhatsAppGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDecision" ADD CONSTRAINT "MatchDecision_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DeckMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDecision" ADD CONSTRAINT "MatchDecision_matchedThreadId_fkey" FOREIGN KEY ("matchedThreadId") REFERENCES "DiscussionThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
