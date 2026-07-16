-- AlterTable: Add barrio and direccion columns to visitas
ALTER TABLE "visitas" ADD COLUMN "barrio" TEXT,
ADD COLUMN "direccion" TEXT;

-- AlterTable: Add barrio column to personas
ALTER TABLE "personas" ADD COLUMN "barrio" TEXT;
