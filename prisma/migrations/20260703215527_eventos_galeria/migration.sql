/*
  Warnings:

  - You are about to drop the column `tipo` on the `eventos` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "eventos" DROP COLUMN "tipo",
ADD COLUMN     "categoria" TEXT NOT NULL DEFAULT 'Otro';

-- CreateTable
CREATE TABLE "evento_imagenes" (
    "id" SERIAL NOT NULL,
    "eventoId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_imagenes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "evento_imagenes" ADD CONSTRAINT "evento_imagenes_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
