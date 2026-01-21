-- CreateTable
CREATE TABLE "Cat_Roles" (
    "ID_Rol" SERIAL NOT NULL,
    "Nombre_Rol" VARCHAR(30) NOT NULL,
    "Descripcion" VARCHAR(255),
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cat_Roles_pkey" PRIMARY KEY ("ID_Rol")
);

-- CreateTable
CREATE TABLE "Cat_Estatus_Empleado" (
    "ID_Estatus" SERIAL NOT NULL,
    "Nombre_Estatus" VARCHAR(30) NOT NULL,
    "Descripcion" VARCHAR(255),
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cat_Estatus_Empleado_pkey" PRIMARY KEY ("ID_Estatus")
);

-- CreateTable
CREATE TABLE "Cat_Areas" (
    "ID_Area" SERIAL NOT NULL,
    "Nombre_Area" VARCHAR(100) NOT NULL,
    "Descripcion" VARCHAR(255),
    "Tipo_Area" VARCHAR(50),
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cat_Areas_pkey" PRIMARY KEY ("ID_Area")
);

-- CreateTable
CREATE TABLE "Cat_Tipo_Horario" (
    "ID_Tipo_Horario" SERIAL NOT NULL,
    "Nombre_Horario" VARCHAR(30) NOT NULL,
    "Descripcion" VARCHAR(255),
    "Horas_Semana" INTEGER,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cat_Tipo_Horario_pkey" PRIMARY KEY ("ID_Tipo_Horario")
);

-- CreateTable
CREATE TABLE "Cat_Nacionalidades" (
    "ID_Nacionalidad" SERIAL NOT NULL,
    "Nombre_Nacionalidad" VARCHAR(50) NOT NULL,
    "Codigo_ISO2" CHAR(2),
    "Codigo_ISO3" CHAR(3),
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cat_Nacionalidades_pkey" PRIMARY KEY ("ID_Nacionalidad")
);

-- CreateTable
CREATE TABLE "Cat_Puestos" (
    "ID_Puesto" SERIAL NOT NULL,
    "Nombre_Puesto" VARCHAR(100) NOT NULL,
    "ID_Area" INTEGER NOT NULL,
    "Descripcion" VARCHAR(255),
    "Salario_Base_Referencia" DECIMAL(10,2),
    "Salario_Hora_Referencia" DECIMAL(10,2),
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cat_Puestos_pkey" PRIMARY KEY ("ID_Puesto")
);

-- CreateTable
CREATE TABLE "Empleados" (
    "ID_Empleado" SERIAL NOT NULL,
    "Nombre" VARCHAR(50) NOT NULL,
    "Apellido_Paterno" VARCHAR(50) NOT NULL,
    "Apellido_Materno" VARCHAR(50),
    "Fecha_Nacimiento" TIMESTAMP(3),
    "ID_Nacionalidad" INTEGER NOT NULL,
    "Documento_Identidad" VARCHAR(50) NOT NULL,
    "Tipo_Documento" VARCHAR(20) NOT NULL,
    "RFC" VARCHAR(13),
    "NSS" VARCHAR(20),
    "ID_Puesto" INTEGER NOT NULL,
    "ID_Area" INTEGER NOT NULL,
    "ID_Tipo_Horario" INTEGER NOT NULL,
    "Salario_Diario" DECIMAL(10,2),
    "Salario_Hora" DECIMAL(10,2),
    "Horas_Semanales_Contratadas" INTEGER,
    "ID_Estatus" INTEGER NOT NULL DEFAULT 1,
    "Fecha_Ingreso" TIMESTAMP(3) NOT NULL,
    "Fecha_Baja" TIMESTAMP(3),
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP(3) NOT NULL,
    "CreatedBy" VARCHAR(100),
    "UpdatedBy" VARCHAR(100),

    CONSTRAINT "Empleados_pkey" PRIMARY KEY ("ID_Empleado")
);

-- CreateTable
CREATE TABLE "Empleados_Contacto" (
    "ID_Contacto" SERIAL NOT NULL,
    "ID_Empleado" INTEGER NOT NULL,
    "Email_Personal" VARCHAR(100),
    "Email_Corporativo" VARCHAR(100),
    "Telefono_Celular" VARCHAR(20),
    "Telefono_Fijo" VARCHAR(20),
    "Calle" VARCHAR(100),
    "Numero_Exterior" VARCHAR(10),
    "Numero_Interior" VARCHAR(10),
    "Colonia" VARCHAR(50),
    "Ciudad" VARCHAR(50),
    "Estado" VARCHAR(50),
    "Codigo_Postal" VARCHAR(10),
    "Pais" VARCHAR(50) DEFAULT 'MÉXICO',
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empleados_Contacto_pkey" PRIMARY KEY ("ID_Contacto")
);

-- CreateTable
CREATE TABLE "Empleados_Documentos" (
    "ID_Documento" SERIAL NOT NULL,
    "ID_Empleado" INTEGER NOT NULL,
    "Tipo_Documento" VARCHAR(50) NOT NULL,
    "Numero_Documento" VARCHAR(50) NOT NULL,
    "Fecha_Expedicion" TIMESTAMP(3),
    "Fecha_Vencimiento" TIMESTAMP(3),
    "Pais_Emisor" VARCHAR(50),
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Empleados_Documentos_pkey" PRIMARY KEY ("ID_Documento")
);

-- CreateTable
CREATE TABLE "App_Usuarios" (
    "ID_Usuario" SERIAL NOT NULL,
    "ID_Empleado" INTEGER,
    "Email_Office365" VARCHAR(100) NOT NULL,
    "Nombre_Completo" VARCHAR(100) NOT NULL,
    "ID_Rol" INTEGER NOT NULL,
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "Ultimo_Acceso" TIMESTAMP(3),
    "Password" VARCHAR(255) NOT NULL,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "App_Usuarios_pkey" PRIMARY KEY ("ID_Usuario")
);

-- CreateTable
CREATE TABLE "Bitacora_Auditoria" (
    "ID_Log" SERIAL NOT NULL,
    "ID_Usuario" INTEGER NOT NULL,
    "Email_Usuario" VARCHAR(100) NOT NULL,
    "Tabla_Afectada" VARCHAR(100) NOT NULL,
    "ID_Registro" INTEGER,
    "Accion" VARCHAR(50) NOT NULL,
    "Datos_Anteriores" TEXT,
    "Datos_Nuevos" TEXT,
    "IP_Usuario" VARCHAR(45),
    "Navegador" VARCHAR(255),
    "FechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bitacora_Auditoria_pkey" PRIMARY KEY ("ID_Log")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cat_Roles_Nombre_Rol_key" ON "Cat_Roles"("Nombre_Rol");

-- CreateIndex
CREATE UNIQUE INDEX "Cat_Estatus_Empleado_Nombre_Estatus_key" ON "Cat_Estatus_Empleado"("Nombre_Estatus");

-- CreateIndex
CREATE UNIQUE INDEX "Cat_Areas_Nombre_Area_key" ON "Cat_Areas"("Nombre_Area");

-- CreateIndex
CREATE UNIQUE INDEX "Cat_Tipo_Horario_Nombre_Horario_key" ON "Cat_Tipo_Horario"("Nombre_Horario");

-- CreateIndex
CREATE UNIQUE INDEX "Cat_Nacionalidades_Nombre_Nacionalidad_key" ON "Cat_Nacionalidades"("Nombre_Nacionalidad");

-- CreateIndex
CREATE UNIQUE INDEX "Cat_Nacionalidades_Codigo_ISO2_key" ON "Cat_Nacionalidades"("Codigo_ISO2");

-- CreateIndex
CREATE UNIQUE INDEX "Cat_Nacionalidades_Codigo_ISO3_key" ON "Cat_Nacionalidades"("Codigo_ISO3");

-- CreateIndex
CREATE UNIQUE INDEX "Cat_Puestos_Nombre_Puesto_key" ON "Cat_Puestos"("Nombre_Puesto");

-- CreateIndex
CREATE INDEX "Cat_Puestos_ID_Area_idx" ON "Cat_Puestos"("ID_Area");

-- CreateIndex
CREATE UNIQUE INDEX "Empleados_Documento_Identidad_key" ON "Empleados"("Documento_Identidad");

-- CreateIndex
CREATE INDEX "Empleados_ID_Nacionalidad_idx" ON "Empleados"("ID_Nacionalidad");

-- CreateIndex
CREATE INDEX "Empleados_ID_Puesto_idx" ON "Empleados"("ID_Puesto");

-- CreateIndex
CREATE INDEX "Empleados_ID_Area_idx" ON "Empleados"("ID_Area");

-- CreateIndex
CREATE INDEX "Empleados_ID_Tipo_Horario_idx" ON "Empleados"("ID_Tipo_Horario");

-- CreateIndex
CREATE INDEX "Empleados_ID_Estatus_idx" ON "Empleados"("ID_Estatus");

-- CreateIndex
CREATE UNIQUE INDEX "Empleados_Contacto_ID_Empleado_key" ON "Empleados_Contacto"("ID_Empleado");

-- CreateIndex
CREATE INDEX "Empleados_Documentos_ID_Empleado_idx" ON "Empleados_Documentos"("ID_Empleado");

-- CreateIndex
CREATE UNIQUE INDEX "App_Usuarios_ID_Empleado_key" ON "App_Usuarios"("ID_Empleado");

-- CreateIndex
CREATE UNIQUE INDEX "App_Usuarios_Email_Office365_key" ON "App_Usuarios"("Email_Office365");

-- CreateIndex
CREATE INDEX "App_Usuarios_Email_Office365_idx" ON "App_Usuarios"("Email_Office365");

-- CreateIndex
CREATE INDEX "App_Usuarios_ID_Rol_idx" ON "App_Usuarios"("ID_Rol");

-- CreateIndex
CREATE INDEX "App_Usuarios_Activo_idx" ON "App_Usuarios"("Activo");

-- CreateIndex
CREATE INDEX "Bitacora_Auditoria_ID_Usuario_idx" ON "Bitacora_Auditoria"("ID_Usuario");

-- CreateIndex
CREATE INDEX "Bitacora_Auditoria_FechaHora_idx" ON "Bitacora_Auditoria"("FechaHora");

-- CreateIndex
CREATE INDEX "Bitacora_Auditoria_Tabla_Afectada_idx" ON "Bitacora_Auditoria"("Tabla_Afectada");

-- AddForeignKey
ALTER TABLE "Cat_Puestos" ADD CONSTRAINT "Cat_Puestos_ID_Area_fkey" FOREIGN KEY ("ID_Area") REFERENCES "Cat_Areas"("ID_Area") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleados" ADD CONSTRAINT "Empleados_ID_Nacionalidad_fkey" FOREIGN KEY ("ID_Nacionalidad") REFERENCES "Cat_Nacionalidades"("ID_Nacionalidad") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleados" ADD CONSTRAINT "Empleados_ID_Puesto_fkey" FOREIGN KEY ("ID_Puesto") REFERENCES "Cat_Puestos"("ID_Puesto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleados" ADD CONSTRAINT "Empleados_ID_Area_fkey" FOREIGN KEY ("ID_Area") REFERENCES "Cat_Areas"("ID_Area") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleados" ADD CONSTRAINT "Empleados_ID_Tipo_Horario_fkey" FOREIGN KEY ("ID_Tipo_Horario") REFERENCES "Cat_Tipo_Horario"("ID_Tipo_Horario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleados" ADD CONSTRAINT "Empleados_ID_Estatus_fkey" FOREIGN KEY ("ID_Estatus") REFERENCES "Cat_Estatus_Empleado"("ID_Estatus") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleados_Contacto" ADD CONSTRAINT "Empleados_Contacto_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleados_Documentos" ADD CONSTRAINT "Empleados_Documentos_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "App_Usuarios" ADD CONSTRAINT "App_Usuarios_ID_Rol_fkey" FOREIGN KEY ("ID_Rol") REFERENCES "Cat_Roles"("ID_Rol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "App_Usuarios" ADD CONSTRAINT "App_Usuarios_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bitacora_Auditoria" ADD CONSTRAINT "Bitacora_Auditoria_ID_Usuario_fkey" FOREIGN KEY ("ID_Usuario") REFERENCES "App_Usuarios"("ID_Usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
