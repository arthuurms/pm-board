-- AlterTable
ALTER TABLE "Tag" ADD COLUMN "color" TEXT NOT NULL DEFAULT '#6B7280';
ALTER TABLE "Tag" DROP COLUMN "emoji";

-- Set specific colors for the seeded tags
UPDATE "Tag" SET "color" = '#EA580C' WHERE "name" = 'Holanda'; -- orange
UPDATE "Tag" SET "color" = '#166534' WHERE "name" = 'México';  -- dark green
UPDATE "Tag" SET "color" = '#1E3A8A' WHERE "name" = 'Colômbia'; -- dark blue
