-- CreateEnum
CREATE TYPE "DiscussionVisibility" AS ENUM ('PRIVATE', 'MEMBERS', 'PUBLIC');

-- AlterTable
ALTER TABLE "DiscussionThread" ADD COLUMN     "visibility" "DiscussionVisibility" NOT NULL DEFAULT 'PRIVATE';
