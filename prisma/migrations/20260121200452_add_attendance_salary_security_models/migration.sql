/*
  Warnings:

  - You are about to drop the column `Pais` on the `Empleados_Contacto` table. All the data in the column will be lost.
  - You are about to drop the column `Telefono_Fijo` on the `Empleados_Contacto` table. All the data in the column will be lost.
  - You are about to drop the column `Fecha_Expedicion` on the `Empleados_Documentos` table. All the data in the column will be lost.
  - You are about to drop the column `Fecha_Vencimiento` on the `Empleados_Documentos` table. All the data in the column will be lost.
  - You are about to drop the column `Numero_Documento` on the `Empleados_Documentos` table. All the data in the column will be lost.
  - You are about to drop the column `Pais_Emisor` on the `Empleados_Documentos` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Empleados_Contacto" DROP COLUMN "Pais",
DROP COLUMN "Telefono_Fijo",
ADD COLUMN     "Nombre_Emergencia" VARCHAR(100),
ADD COLUMN     "Parentesco_Emergencia" VARCHAR(50),
ADD COLUMN     "Telefono_Emergencia" VARCHAR(20);

-- AlterTable
ALTER TABLE "Empleados_Documentos" DROP COLUMN "Fecha_Expedicion",
DROP COLUMN "Fecha_Vencimiento",
DROP COLUMN "Numero_Documento",
DROP COLUMN "Pais_Emisor",
ADD COLUMN     "Observaciones" VARCHAR(255),
ADD COLUMN     "Tiene_Documento" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Empleados_Asistencia" (
    "ID_Asistencia" SERIAL NOT NULL,
    "ID_Empleado" INTEGER NOT NULL,
    "Fecha" DATE NOT NULL,
    "Hora_Entrada" TIMESTAMP(3),
    "Hora_Salida" TIMESTAMP(3),
    "Horas_Trabajadas" DECIMAL(8,2),
    "Horas_Extras" DECIMAL(8,2),
    "Minutos_Retardo" INTEGER DEFAULT 0,
    "Presente" BOOLEAN NOT NULL DEFAULT true,
    "Justificado" BOOLEAN NOT NULL DEFAULT false,
    "Motivo_Falta" VARCHAR(255),
    "Observaciones" VARCHAR(255),
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "CreatedBy" VARCHAR(100),

    CONSTRAINT "Empleados_Asistencia_pkey" PRIMARY KEY ("ID_Asistencia")
);

-- CreateTable
CREATE TABLE "Empleados_Horas_Adicionales" (
    "ID_Horas" SERIAL NOT NULL,
    "ID_Empleado" INTEGER NOT NULL,
    "Fecha" DATE NOT NULL,
    "Tipo_Hora" VARCHAR(50) NOT NULL,
    "Cantidad_Horas" DECIMAL(8,2) NOT NULL,
    "Descripcion" VARCHAR(255),
    "Aprobado" BOOLEAN NOT NULL DEFAULT false,
    "Aprobado_Por" INTEGER,
    "Fecha_Aprobacion" TIMESTAMP(3),
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "CreatedBy" VARCHAR(100),

    CONSTRAINT "Empleados_Horas_Adicionales_pkey" PRIMARY KEY ("ID_Horas")
);

-- CreateTable
CREATE TABLE "Escala_Salarial" (
    "ID_Escala" SERIAL NOT NULL,
    "ID_Area" INTEGER NOT NULL,
    "ID_Puesto" INTEGER NOT NULL,
    "Salario_Base" DECIMAL(10,2) NOT NULL,
    "Salario_Diario" DECIMAL(10,2) NOT NULL,
    "Valor_Hora" DECIMAL(10,2) NOT NULL,
    "Valor_Hora_Extra" DECIMAL(10,2) NOT NULL,
    "Vigente_Desde" DATE NOT NULL,
    "Vigente_Hasta" DATE,
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "Aprobado_Por" INTEGER NOT NULL,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Escala_Salarial_pkey" PRIMARY KEY ("ID_Escala")
);

-- CreateTable
CREATE TABLE "Bitacora_Accesos" (
    "ID_Acceso" SERIAL NOT NULL,
    "ID_Usuario" INTEGER NOT NULL,
    "Email_Usuario" VARCHAR(100) NOT NULL,
    "Accion" VARCHAR(100) NOT NULL,
    "IP_Usuario" VARCHAR(45),
    "User_Agent" VARCHAR(500),
    "Exitoso" BOOLEAN NOT NULL DEFAULT true,
    "Motivo_Error" TEXT,
    "FechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bitacora_Accesos_pkey" PRIMARY KEY ("ID_Acceso")
);

-- CreateIndex
CREATE INDEX "Empleados_Asistencia_ID_Empleado_idx" ON "Empleados_Asistencia"("ID_Empleado");

-- CreateIndex
CREATE INDEX "Empleados_Asistencia_Fecha_idx" ON "Empleados_Asistencia"("Fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Empleados_Asistencia_ID_Empleado_Fecha_key" ON "Empleados_Asistencia"("ID_Empleado", "Fecha");

-- CreateIndex
CREATE INDEX "Empleados_Horas_Adicionales_ID_Empleado_idx" ON "Empleados_Horas_Adicionales"("ID_Empleado");

-- CreateIndex
CREATE INDEX "Empleados_Horas_Adicionales_Fecha_idx" ON "Empleados_Horas_Adicionales"("Fecha");

-- CreateIndex
CREATE INDEX "Escala_Salarial_ID_Area_idx" ON "Escala_Salarial"("ID_Area");

-- CreateIndex
CREATE INDEX "Escala_Salarial_ID_Puesto_idx" ON "Escala_Salarial"("ID_Puesto");

-- CreateIndex
CREATE UNIQUE INDEX "Escala_Salarial_ID_Area_ID_Puesto_Vigente_Desde_key" ON "Escala_Salarial"("ID_Area", "ID_Puesto", "Vigente_Desde");

-- CreateIndex
CREATE INDEX "Bitacora_Accesos_ID_Usuario_idx" ON "Bitacora_Accesos"("ID_Usuario");

-- CreateIndex
CREATE INDEX "Bitacora_Accesos_FechaHora_idx" ON "Bitacora_Accesos"("FechaHora");

-- AddForeignKey
ALTER TABLE "Empleados_Asistencia" ADD CONSTRAINT "Empleados_Asistencia_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleados_Horas_Adicionales" ADD CONSTRAINT "Empleados_Horas_Adicionales_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleados_Horas_Adicionales" ADD CONSTRAINT "Empleados_Horas_Adicionales_Aprobado_Por_fkey" FOREIGN KEY ("Aprobado_Por") REFERENCES "App_Usuarios"("ID_Usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escala_Salarial" ADD CONSTRAINT "Escala_Salarial_ID_Area_fkey" FOREIGN KEY ("ID_Area") REFERENCES "Cat_Areas"("ID_Area") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escala_Salarial" ADD CONSTRAINT "Escala_Salarial_ID_Puesto_fkey" FOREIGN KEY ("ID_Puesto") REFERENCES "Cat_Puestos"("ID_Puesto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escala_Salarial" ADD CONSTRAINT "Escala_Salarial_Aprobado_Por_fkey" FOREIGN KEY ("Aprobado_Por") REFERENCES "App_Usuarios"("ID_Usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bitacora_Accesos" ADD CONSTRAINT "Bitacora_Accesos_ID_Usuario_fkey" FOREIGN KEY ("ID_Usuario") REFERENCES "App_Usuarios"("ID_Usuario") ON DELETE CASCADE ON UPDATE CASCADE;
