-- AlterTable: add moderatorPin to Quiz (default "1234" for existing rows)
ALTER TABLE "Quiz" ADD COLUMN IF NOT EXISTS "moderatorPin" TEXT NOT NULL DEFAULT '1234';

-- AlterTable: add isQualifier to Round (default false for existing rows)
ALTER TABLE "Round" ADD COLUMN IF NOT EXISTS "isQualifier" BOOLEAN NOT NULL DEFAULT false;
