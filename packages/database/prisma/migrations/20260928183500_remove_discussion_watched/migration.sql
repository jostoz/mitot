-- DropIndex
DROP INDEX IF EXISTS "DiscussionThread_groupId_watched_idx";

-- AlterTable
ALTER TABLE "DiscussionThread" DROP COLUMN IF EXISTS "watched";
