-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "tagId" TEXT;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed initial country tags
INSERT INTO "Tag" ("id", "name", "emoji") VALUES
  ('tag_colombia', 'Colômbia', '🇨🇴'),
  ('tag_mexico', 'México', '🇲🇽'),
  ('tag_holanda', 'Holanda', '🇳🇱');
