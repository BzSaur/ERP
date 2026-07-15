-- CreateTable
CREATE TABLE "Vacaciones_Periodos" (
    "ID_Periodo_Vac" SERIAL NOT NULL,
    "ID_Vacacion" INTEGER NOT NULL,
    "ID_Empleado" INTEGER NOT NULL,
    "Fecha_Inicio" DATE NOT NULL,
    "Fecha_Fin" DATE NOT NULL,
    "Dias" INTEGER NOT NULL,
    "Estado" VARCHAR(20) NOT NULL DEFAULT 'APROBADO',
    "Aprobado_Por" INTEGER,
    "Observaciones" VARCHAR(500),
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "CreatedBy" VARCHAR(100),

    CONSTRAINT "Vacaciones_Periodos_pkey" PRIMARY KEY ("ID_Periodo_Vac")
);

-- CreateIndex
CREATE INDEX "Vacaciones_Periodos_ID_Empleado_idx" ON "Vacaciones_Periodos"("ID_Empleado");

-- CreateIndex
CREATE INDEX "Vacaciones_Periodos_Fecha_Inicio_idx" ON "Vacaciones_Periodos"("Fecha_Inicio");

-- CreateIndex
CREATE INDEX "Vacaciones_Periodos_Estado_idx" ON "Vacaciones_Periodos"("Estado");

-- AddForeignKey
ALTER TABLE "Vacaciones_Periodos" ADD CONSTRAINT "Vacaciones_Periodos_ID_Vacacion_fkey" FOREIGN KEY ("ID_Vacacion") REFERENCES "Vacaciones"("ID_Vacacion") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacaciones_Periodos" ADD CONSTRAINT "Vacaciones_Periodos_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacaciones_Periodos" ADD CONSTRAINT "Vacaciones_Periodos_Aprobado_Por_fkey" FOREIGN KEY ("Aprobado_Por") REFERENCES "App_Usuarios"("ID_Usuario") ON DELETE SET NULL ON UPDATE CASCADE;
