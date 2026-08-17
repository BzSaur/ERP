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
CREATE TABLE "Cat_Tipo_Actividad" (
    "ID_Tipo_Actividad" SERIAL NOT NULL,
    "Nombre" VARCHAR(50) NOT NULL,
    "Color" VARCHAR(7) NOT NULL DEFAULT '#6f42c1',
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "CreatedBy" VARCHAR(100),

    CONSTRAINT "Cat_Tipo_Actividad_pkey" PRIMARY KEY ("ID_Tipo_Actividad")
);

-- CreateTable
CREATE TABLE "Cat_Encargados" (
    "ID_Encargado_Cat" SERIAL NOT NULL,
    "ID_Empleado" INTEGER NOT NULL,
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "CreatedBy" VARCHAR(100),

    CONSTRAINT "Cat_Encargados_pkey" PRIMARY KEY ("ID_Encargado_Cat")
);

-- CreateTable
CREATE TABLE "Grupos" (
    "ID_Grupo" SERIAL NOT NULL,
    "Nombre_Grupo" VARCHAR(150) NOT NULL,
    "ID_Encargado" INTEGER NOT NULL,
    "Descripcion" VARCHAR(255),
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "CreatedBy" VARCHAR(100),
    "UpdatedAt" TIMESTAMP(3) NOT NULL,
    "UpdatedBy" VARCHAR(100),

    CONSTRAINT "Grupos_pkey" PRIMARY KEY ("ID_Grupo")
);

-- CreateTable
CREATE TABLE "Grupo_Miembros" (
    "ID_Miembro" SERIAL NOT NULL,
    "ID_Grupo" INTEGER NOT NULL,
    "ID_Empleado" INTEGER NOT NULL,
    "Fecha_Inicio" DATE NOT NULL,
    "Fecha_Fin" DATE,
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "CreatedBy" VARCHAR(100),

    CONSTRAINT "Grupo_Miembros_pkey" PRIMARY KEY ("ID_Miembro")
);

-- CreateTable
CREATE TABLE "Actividades_Campo" (
    "ID_Actividad" SERIAL NOT NULL,
    "Nombre_Actividad" VARCHAR(150) NOT NULL,
    "ID_Tipo_Actividad" INTEGER NOT NULL,
    "ID_Empresa" INTEGER NOT NULL,
    "ID_Responsable" INTEGER NOT NULL,
    "Descripcion" VARCHAR(255),
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "CreatedBy" VARCHAR(100),

    CONSTRAINT "Actividades_Campo_pkey" PRIMARY KEY ("ID_Actividad")
);

-- CreateTable
CREATE TABLE "Actividad_Recurrencias" (
    "ID_Recurrencia" SERIAL NOT NULL,
    "ID_Empleado" INTEGER NOT NULL,
    "ID_Grupo" INTEGER,
    "ID_Tipo_Actividad" INTEGER NOT NULL,
    "Nombre_Actividad" VARCHAR(150) NOT NULL,
    "ID_Empresa" INTEGER NOT NULL,
    "Dia_Semana" INTEGER NOT NULL,
    "Fecha_Inicio" DATE NOT NULL,
    "Fecha_Fin" DATE,
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "CreatedBy" VARCHAR(100),

    CONSTRAINT "Actividad_Recurrencias_pkey" PRIMARY KEY ("ID_Recurrencia")
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

-- CreateTable
CREATE TABLE "Notificaciones" (
    "ID_Notificacion" SERIAL NOT NULL,
    "ID_Usuario" INTEGER NOT NULL,
    "Tipo" VARCHAR(40) NOT NULL,
    "Titulo" VARCHAR(150) NOT NULL,
    "Mensaje" VARCHAR(500) NOT NULL,
    "Url" VARCHAR(255),
    "Leida" BOOLEAN NOT NULL DEFAULT false,
    "FechaLeida" TIMESTAMP(3),
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificaciones_pkey" PRIMARY KEY ("ID_Notificacion")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cat_Empresas_Nombre_Empresa_key" ON "Cat_Empresas"("Nombre_Empresa");

-- CreateIndex
CREATE UNIQUE INDEX "Cat_Tipo_Actividad_Nombre_key" ON "Cat_Tipo_Actividad"("Nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Cat_Encargados_ID_Empleado_key" ON "Cat_Encargados"("ID_Empleado");

-- CreateIndex
CREATE INDEX "Grupos_ID_Encargado_idx" ON "Grupos"("ID_Encargado");

-- CreateIndex
CREATE INDEX "Grupo_Miembros_ID_Grupo_idx" ON "Grupo_Miembros"("ID_Grupo");

-- CreateIndex
CREATE INDEX "Grupo_Miembros_ID_Empleado_idx" ON "Grupo_Miembros"("ID_Empleado");

-- CreateIndex
CREATE INDEX "Actividades_Campo_ID_Empresa_idx" ON "Actividades_Campo"("ID_Empresa");

-- CreateIndex
CREATE INDEX "Actividades_Campo_ID_Responsable_idx" ON "Actividades_Campo"("ID_Responsable");

-- CreateIndex
CREATE INDEX "Actividades_Campo_ID_Tipo_Actividad_idx" ON "Actividades_Campo"("ID_Tipo_Actividad");

-- CreateIndex
CREATE INDEX "Actividad_Recurrencias_ID_Tipo_Actividad_idx" ON "Actividad_Recurrencias"("ID_Tipo_Actividad");

-- CreateIndex
CREATE INDEX "Actividad_Recurrencias_ID_Empleado_idx" ON "Actividad_Recurrencias"("ID_Empleado");

-- CreateIndex
CREATE INDEX "Actividad_Recurrencias_ID_Grupo_idx" ON "Actividad_Recurrencias"("ID_Grupo");

-- CreateIndex
CREATE INDEX "Actividad_Recurrencias_Dia_Semana_idx" ON "Actividad_Recurrencias"("Dia_Semana");

-- CreateIndex
CREATE INDEX "Actividad_Asignaciones_ID_Actividad_idx" ON "Actividad_Asignaciones"("ID_Actividad");

-- CreateIndex
CREATE INDEX "Actividad_Asignaciones_ID_Empleado_idx" ON "Actividad_Asignaciones"("ID_Empleado");

-- CreateIndex
CREATE INDEX "Actividad_Asignaciones_Fecha_idx" ON "Actividad_Asignaciones"("Fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Actividad_Asignaciones_ID_Empleado_Fecha_key" ON "Actividad_Asignaciones"("ID_Empleado", "Fecha");

-- CreateIndex
CREATE INDEX "Notificaciones_ID_Usuario_idx" ON "Notificaciones"("ID_Usuario");

-- CreateIndex
CREATE INDEX "Notificaciones_ID_Usuario_Leida_idx" ON "Notificaciones"("ID_Usuario", "Leida");

-- AddForeignKey
ALTER TABLE "Cat_Encargados" ADD CONSTRAINT "Cat_Encargados_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grupos" ADD CONSTRAINT "Grupos_ID_Encargado_fkey" FOREIGN KEY ("ID_Encargado") REFERENCES "Cat_Encargados"("ID_Encargado_Cat") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grupo_Miembros" ADD CONSTRAINT "Grupo_Miembros_ID_Grupo_fkey" FOREIGN KEY ("ID_Grupo") REFERENCES "Grupos"("ID_Grupo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grupo_Miembros" ADD CONSTRAINT "Grupo_Miembros_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividades_Campo" ADD CONSTRAINT "Actividades_Campo_ID_Tipo_Actividad_fkey" FOREIGN KEY ("ID_Tipo_Actividad") REFERENCES "Cat_Tipo_Actividad"("ID_Tipo_Actividad") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividades_Campo" ADD CONSTRAINT "Actividades_Campo_ID_Empresa_fkey" FOREIGN KEY ("ID_Empresa") REFERENCES "Cat_Empresas"("ID_Empresa") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividades_Campo" ADD CONSTRAINT "Actividades_Campo_ID_Responsable_fkey" FOREIGN KEY ("ID_Responsable") REFERENCES "Empleados"("ID_Empleado") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad_Recurrencias" ADD CONSTRAINT "Actividad_Recurrencias_ID_Tipo_Actividad_fkey" FOREIGN KEY ("ID_Tipo_Actividad") REFERENCES "Cat_Tipo_Actividad"("ID_Tipo_Actividad") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad_Recurrencias" ADD CONSTRAINT "Actividad_Recurrencias_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad_Recurrencias" ADD CONSTRAINT "Actividad_Recurrencias_ID_Grupo_fkey" FOREIGN KEY ("ID_Grupo") REFERENCES "Grupos"("ID_Grupo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad_Recurrencias" ADD CONSTRAINT "Actividad_Recurrencias_ID_Empresa_fkey" FOREIGN KEY ("ID_Empresa") REFERENCES "Cat_Empresas"("ID_Empresa") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad_Asignaciones" ADD CONSTRAINT "Actividad_Asignaciones_ID_Actividad_fkey" FOREIGN KEY ("ID_Actividad") REFERENCES "Actividades_Campo"("ID_Actividad") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad_Asignaciones" ADD CONSTRAINT "Actividad_Asignaciones_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificaciones" ADD CONSTRAINT "Notificaciones_ID_Usuario_fkey" FOREIGN KEY ("ID_Usuario") REFERENCES "App_Usuarios"("ID_Usuario") ON DELETE CASCADE ON UPDATE CASCADE;
