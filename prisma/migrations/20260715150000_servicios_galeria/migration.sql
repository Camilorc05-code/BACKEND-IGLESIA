-- AlterTable
ALTER TABLE "servicios" ADD COLUMN "imagenUrl" TEXT;

-- CreateTable
CREATE TABLE "servicio_imagenes" (
    "id" SERIAL NOT NULL,
    "servicioId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "servicio_imagenes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "servicio_imagenes" ADD CONSTRAINT "servicio_imagenes_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
