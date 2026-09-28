-- CreateTable
CREATE TABLE "RoutingCorrection" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fromThreadId" TEXT,
    "toThreadId" TEXT,
    "correctedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutingCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoutingCorrection_groupId_createdAt_idx" ON "RoutingCorrection"("groupId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "RoutingCorrection_messageId_idx" ON "RoutingCorrection"("messageId");

-- AddForeignKey
ALTER TABLE "RoutingCorrection" ADD CONSTRAINT "RoutingCorrection_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DeckMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingCorrection" ADD CONSTRAINT "RoutingCorrection_toThreadId_fkey" FOREIGN KEY ("toThreadId") REFERENCES "DiscussionThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
