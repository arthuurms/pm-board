-- AlterTable
ALTER TABLE "Goal" ADD COLUMN "month" TEXT;

-- Backfill: month of creation in Brasília time (UTC-3)
UPDATE "Goal" SET "month" = to_char("createdAt" - interval '3 hours', 'YYYY-MM');
