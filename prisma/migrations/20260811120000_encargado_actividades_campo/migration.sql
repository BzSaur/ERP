-- CreateTable
CREATE TABLE "Cat_Empresas" (
    "ID_Empresa" SERIAL NOT NULL,
    "Nombre_Empresa" VARCHAR(150) NOT NULL,
    "Descripcion" VARCHAR(255),
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cat_Empresas_pkey" PRIMARY KEY ("ID_Empresa")
);

-- CreateTable
CREATE TABLE "Encargado_Subordinados" (
    "ID_Relacion" SERIAL NOT NULL,
    "ID_Encargado" INTEGER NOT NULL,
    "ID_Subordinado" INTEGER NOT NULL,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "CreatedBy" VARCHAR(100),

    CONSTRAINT "Encargado_Subordinados_pkey" PRIMARY KEY ("ID_Relacion")
);

-- CreateTable
CREATE TABLE "Actividades_Campo" (
    "ID_Actividad" SERIAL NOT NULL,
    "Nombre_Actividad" VARCHAR(150) NOT NULL,
    "ID_Empresa" INTEGER NOT NULL,
    "ID_Responsable" INTEGER NOT NULL,
    "Descripcion" VARCHAR(255),
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "CreatedBy" VARCHAR(100),

    CONSTRAINT "Actividades_Campo_pkey" PRIMARY KEY ("ID_Actividad")
);

-- CreateTable
CREATE TABLE "Actividad_Asignaciones" (
    "ID_Asignacion" SERIAL NOT NULL,
    "ID_Actividad" INTEGER NOT NULL,
    "ID_Empleado" INTEGER NOT NULL,
    "Fecha" DATE NOT NULL,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "CreatedBy" VARCHAR(100),

    CONSTRAINT "Actividad_Asignaciones_pkey" PRIMARY KEY ("ID_Asignacion")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cat_Empresas_Nombre_Empresa_key" ON "Cat_Empresas"("Nombre_Empresa");

-- CreateIndex
CREATE INDEX "Encargado_Subordinados_ID_Encargado_idx" ON "Encargado_Subordinados"("ID_Encargado");

-- CreateIndex
CREATE INDEX "Encargado_Subordinados_ID_Subordinado_idx" ON "Encargado_Subordinados"("ID_Subordinado");

-- CreateIndex
CREATE UNIQUE INDEX "Encargado_Subordinados_ID_Encargado_ID_Subordinado_key" ON "Encargado_Subordinados"("ID_Encargado", "ID_Subordinado");

-- CreateIndex
CREATE INDEX "Actividades_Campo_ID_Empresa_idx" ON "Actividades_Campo"("ID_Empresa");

-- CreateIndex
CREATE INDEX "Actividades_Campo_ID_Responsable_idx" ON "Actividades_Campo"("ID_Responsable");

-- CreateIndex
CREATE INDEX "Actividad_Asignaciones_ID_Actividad_idx" ON "Actividad_Asignaciones"("ID_Actividad");

-- CreateIndex
CREATE INDEX "Actividad_Asignaciones_ID_Empleado_idx" ON "Actividad_Asignaciones"("ID_Empleado");

-- CreateIndex
CREATE INDEX "Actividad_Asignaciones_Fecha_idx" ON "Actividad_Asignaciones"("Fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Actividad_Asignaciones_ID_Empleado_Fecha_key" ON "Actividad_Asignaciones"("ID_Empleado", "Fecha");

-- AddForeignKey
ALTER TABLE "Encargado_Subordinados" ADD CONSTRAINT "Encargado_Subordinados_ID_Encargado_fkey" FOREIGN KEY ("ID_Encargado") REFERENCES "Empleados"("ID_Empleado") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encargado_Subordinados" ADD CONSTRAINT "Encargado_Subordinados_ID_Subordinado_fkey" FOREIGN KEY ("ID_Subordinado") REFERENCES "Empleados"("ID_Empleado") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividades_Campo" ADD CONSTRAINT "Actividades_Campo_ID_Empresa_fkey" FOREIGN KEY ("ID_Empresa") REFERENCES "Cat_Empresas"("ID_Empresa") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividades_Campo" ADD CONSTRAINT "Actividades_Campo_ID_Responsable_fkey" FOREIGN KEY ("ID_Responsable") REFERENCES "Empleados"("ID_Empleado") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad_Asignaciones" ADD CONSTRAINT "Actividad_Asignaciones_ID_Actividad_fkey" FOREIGN KEY ("ID_Actividad") REFERENCES "Actividades_Campo"("ID_Actividad") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad_Asignaciones" ADD CONSTRAINT "Actividad_Asignaciones_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE CASCADE ON UPDATE CASCADE;
