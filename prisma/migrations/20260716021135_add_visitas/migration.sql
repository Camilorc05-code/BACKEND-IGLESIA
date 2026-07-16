-- CreateTable
CREATE TABLE "visitas" (
    "id" SERIAL NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT NOT NULL,
    "adicional" TEXT,
    "asisteOtraIglesia" TEXT NOT NULL,
    "desearLlamada" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitas_pkey" PRIMARY KEY ("id")
);
