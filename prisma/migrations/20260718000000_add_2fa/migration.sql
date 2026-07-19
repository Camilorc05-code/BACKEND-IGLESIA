-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "usuarios" ADD COLUMN "twoFactorSecret" TEXT;
