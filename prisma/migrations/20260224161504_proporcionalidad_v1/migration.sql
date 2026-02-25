-- AlterTable
ALTER TABLE "Aguinaldo" ADD COLUMN     "Dias_Efectivos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "Factor_Proporcionalidad" DECIMAL(8,6) NOT NULL DEFAULT 1,
ADD COLUMN     "Faltas_Equivalentes" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "Faltas_Injustificadas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "Horas_Faltantes" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Cat_Tipo_Horario" ADD COLUMN     "Dias_Semana" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "Horas_Jornada" INTEGER NOT NULL DEFAULT 8;

-- AlterTable
ALTER TABLE "Cat_Tipo_Incidencia" ADD COLUMN     "Afecta_Aguinaldo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "Afecta_Vacaciones" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Nomina" ADD COLUMN     "Descuento_Horas_Faltantes" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "Horas_Faltantes" DECIMAL(8,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Vacaciones" ADD COLUMN     "Dias_Proporcionales" INTEGER,
ADD COLUMN     "Factor_Jornada" DECIMAL(8,6);
