-- AlterTable
ALTER TABLE "StudyRoom" ADD COLUMN     "deletedAt" TIMESTAMP(6),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "StudyRoom_isDeleted_idx" ON "StudyRoom"("isDeleted");
