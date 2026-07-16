/*
  Warnings:

  - You are about to drop the column `fechaBautismo` on the `personas` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "personas" DROP COLUMN "fechaBautismo",
ADD COLUMN     "bautizado" BOOLEAN NOT NULL DEFAULT false;
