-- AlterTable: replace single attachment with up to several (client-side capped at 10)
ALTER TABLE "Incident" ADD COLUMN "attachmentUrls" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Incident" ADD COLUMN "attachmentNames" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill from the old single-attachment columns
UPDATE "Incident"
SET "attachmentUrls" = ARRAY["attachmentUrl"],
    "attachmentNames" = ARRAY[COALESCE("attachmentName", "attachmentUrl")]
WHERE "attachmentUrl" IS NOT NULL;

ALTER TABLE "Incident" DROP COLUMN "attachmentUrl";
ALTER TABLE "Incident" DROP COLUMN "attachmentName";
