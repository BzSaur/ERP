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
CREATE TABLE "Cat_Tipo_Incidencia" (
    "ID_Tipo_Incidencia" SERIAL NOT NULL,
    "Codigo" VARCHAR(20) NOT NULL,
    "Nombre" VARCHAR(50) NOT NULL,
    "Descripcion" VARCHAR(255),
    "Con_Goce_Sueldo" BOOLEAN NOT NULL DEFAULT false,
    "Requiere_Documento" BOOLEAN NOT NULL DEFAULT false,
    "Afecta_Puntualidad" BOOLEAN NOT NULL DEFAULT true,
    "Afecta_Asistencia" BOOLEAN NOT NULL DEFAULT true,
    "Dias_Maximos" INTEGER,
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cat_Tipo_Incidencia_pkey" PRIMARY KEY ("ID_Tipo_Incidencia")
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
    "Email_Personal" VARCHAR(100),
    "Email_Corporativo" VARCHAR(100),
    "Telefono_Celular" VARCHAR(20),
    "Telefono_Emergencia" VARCHAR(20),
    "Nombre_Emergencia" VARCHAR(100),
    "Parentesco_Emergencia" VARCHAR(50),
    "Calle" VARCHAR(100),
    "Numero_Exterior" VARCHAR(10),
    "Numero_Interior" VARCHAR(10),
    "Colonia" VARCHAR(50),
    "Ciudad" VARCHAR(50),
    "Entidad_Federativa" VARCHAR(50),
    "Codigo_Postal" VARCHAR(10),
    "ID_Puesto" INTEGER NOT NULL,
    "ID_Area" INTEGER NOT NULL,
    "ID_Tipo_Horario" INTEGER NOT NULL,
    "Salario_Mensual" DECIMAL(10,2),
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

-- CreateTable
CREATE TABLE "Empleados_Asistencia" (
    "ID_Asistencia" SERIAL NOT NULL,
    "ID_Empleado" INTEGER NOT NULL,
    "Fecha" DATE NOT NULL,
    "Hora_Entrada" TIMESTAMP(3),
    "Hora_Salida" TIMESTAMP(3),
    "Hora_Comida_Salida" TIMESTAMP(3),
    "Hora_Comida_Entrada" TIMESTAMP(3),
    "Horas_Trabajadas" DECIMAL(8,2),
    "Horas_Extras" DECIMAL(8,2),
    "Minutos_Retardo" INTEGER DEFAULT 0,
    "Retardo" BOOLEAN NOT NULL DEFAULT false,
    "Presente" BOOLEAN NOT NULL DEFAULT true,
    "Justificado" BOOLEAN NOT NULL DEFAULT false,
    "Motivo_Falta" VARCHAR(255),
    "Ubicacion_Entrada" VARCHAR(20),
    "Ubicacion_Salida" VARCHAR(20),
    "Notas" VARCHAR(500),
    "Observaciones" VARCHAR(255),
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "CreatedBy" VARCHAR(100),
    "UpdatedAt" TIMESTAMP(3),

    CONSTRAINT "Empleados_Asistencia_pkey" PRIMARY KEY ("ID_Asistencia")
);

-- CreateTable
CREATE TABLE "Historial_Checadas" (
    "ID_Checada" SERIAL NOT NULL,
    "ID_Asistencia" INTEGER NOT NULL,
    "Tipo_Checada" VARCHAR(30) NOT NULL,
    "Fecha_Hora" TIMESTAMP(3) NOT NULL,
    "Ubicacion" VARCHAR(20) NOT NULL,
    "Dispositivo" VARCHAR(100),
    "Estado" VARCHAR(30) NOT NULL,
    "IP_Dispositivo" VARCHAR(45),
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Historial_Checadas_pkey" PRIMARY KEY ("ID_Checada")
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
CREATE TABLE "Empleados_Incidencias" (
    "ID_Incidencia" SERIAL NOT NULL,
    "ID_Empleado" INTEGER NOT NULL,
    "ID_Tipo_Incidencia" INTEGER NOT NULL,
    "Fecha_Inicio" DATE NOT NULL,
    "Fecha_Fin" DATE NOT NULL,
    "Dias_Totales" INTEGER NOT NULL,
    "Con_Goce_Sueldo" BOOLEAN NOT NULL DEFAULT false,
    "Folio_Documento" VARCHAR(50),
    "Tiene_Documento" BOOLEAN NOT NULL DEFAULT false,
    "Observaciones" VARCHAR(500),
    "Estado" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "Aprobado_Por" INTEGER,
    "Fecha_Aprobacion" TIMESTAMP(3),
    "Motivo_Rechazo" VARCHAR(255),
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP(3) NOT NULL,
    "CreatedBy" VARCHAR(100),

    CONSTRAINT "Empleados_Incidencias_pkey" PRIMARY KEY ("ID_Incidencia")
);

-- CreateTable
CREATE TABLE "Periodos_Nomina" (
    "ID_Periodo" SERIAL NOT NULL,
    "Nombre_Periodo" VARCHAR(100) NOT NULL,
    "Tipo_Periodo" VARCHAR(20) NOT NULL,
    "Fecha_Inicio" DATE NOT NULL,
    "Fecha_Fin" DATE NOT NULL,
    "Fecha_Pago" DATE NOT NULL,
    "Dias_Periodo" INTEGER NOT NULL,
    "Estado" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "Cerrado_Por" INTEGER,
    "Fecha_Cierre" TIMESTAMP(3),
    "Observaciones" VARCHAR(500),
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "CreatedBy" VARCHAR(100),

    CONSTRAINT "Periodos_Nomina_pkey" PRIMARY KEY ("ID_Periodo")
);

-- CreateTable
CREATE TABLE "Nomina" (
    "ID_Nomina" SERIAL NOT NULL,
    "ID_Periodo" INTEGER NOT NULL,
    "ID_Empleado" INTEGER NOT NULL,
    "Dias_Trabajados" INTEGER NOT NULL DEFAULT 0,
    "Dias_Faltas" INTEGER NOT NULL DEFAULT 0,
    "Dias_Incapacidad" INTEGER NOT NULL DEFAULT 0,
    "Dias_Vacaciones" INTEGER NOT NULL DEFAULT 0,
    "Horas_Normales" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "Horas_Extra" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "Horas_Dobles" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "Horas_Triples" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "Salario_Base" DECIMAL(12,2) NOT NULL,
    "Pago_Horas_Extra" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Pago_Horas_Dobles" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Pago_Horas_Triples" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Bono_Puntualidad" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Bono_Asistencia" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Otros_Bonos" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Prima_Vacacional" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Aguinaldo_Proporcional" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Total_Percepciones" DECIMAL(12,2) NOT NULL,
    "Deduccion_IMSS" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Deduccion_ISR" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Deduccion_Infonavit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Deduccion_Fonacot" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Otras_Deducciones" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Total_Deducciones" DECIMAL(12,2) NOT NULL,
    "Sueldo_Neto" DECIMAL(12,2) NOT NULL,
    "Estado" VARCHAR(20) NOT NULL DEFAULT 'CALCULADO',
    "Aprobado_Por" INTEGER,
    "Fecha_Aprobacion" TIMESTAMP(3),
    "Pagado" BOOLEAN NOT NULL DEFAULT false,
    "Fecha_Pago" TIMESTAMP(3),
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP(3) NOT NULL,
    "CreatedBy" VARCHAR(100),

    CONSTRAINT "Nomina_pkey" PRIMARY KEY ("ID_Nomina")
);

-- CreateTable
CREATE TABLE "Vacaciones" (
    "ID_Vacacion" SERIAL NOT NULL,
    "ID_Empleado" INTEGER NOT NULL,
    "Anio" INTEGER NOT NULL,
    "Dias_Correspondientes" INTEGER NOT NULL,
    "Dias_Tomados" INTEGER NOT NULL DEFAULT 0,
    "Dias_Pendientes" INTEGER NOT NULL,
    "Prima_Vacacional_Pagada" BOOLEAN NOT NULL DEFAULT false,
    "Fecha_Inicio" DATE,
    "Fecha_Fin" DATE,
    "Estado" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "Aprobado_Por" INTEGER,
    "Fecha_Aprobacion" TIMESTAMP(3),
    "Observaciones" VARCHAR(500),
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vacaciones_pkey" PRIMARY KEY ("ID_Vacacion")
);

-- CreateTable
CREATE TABLE "Aguinaldo" (
    "ID_Aguinaldo" SERIAL NOT NULL,
    "ID_Empleado" INTEGER NOT NULL,
    "Anio" INTEGER NOT NULL,
    "Fecha_Ingreso" DATE NOT NULL,
    "Fecha_Corte" DATE NOT NULL,
    "Dias_Laborados" INTEGER NOT NULL,
    "Dias_Aguinaldo" INTEGER NOT NULL DEFAULT 15,
    "Salario_Diario" DECIMAL(10,2) NOT NULL,
    "Monto_Bruto" DECIMAL(12,2) NOT NULL,
    "Deduccion_ISR" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Monto_Neto" DECIMAL(12,2) NOT NULL,
    "Pagado" BOOLEAN NOT NULL DEFAULT false,
    "Fecha_Pago" TIMESTAMP(3),
    "Calculado_Por" INTEGER,
    "Fecha_Calculo" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "Observaciones" VARCHAR(500),

    CONSTRAINT "Aguinaldo_pkey" PRIMARY KEY ("ID_Aguinaldo")
);

-- CreateTable
CREATE TABLE "Finiquito_Liquidacion" (
    "ID_Finiquito" SERIAL NOT NULL,
    "ID_Empleado" INTEGER NOT NULL,
    "Tipo" VARCHAR(20) NOT NULL,
    "Fecha_Baja" DATE NOT NULL,
    "Motivo_Baja" VARCHAR(100) NOT NULL,
    "Fecha_Ingreso" DATE NOT NULL,
    "Antiguedad_Anos" INTEGER NOT NULL,
    "Antiguedad_Meses" INTEGER NOT NULL,
    "Antiguedad_Dias" INTEGER NOT NULL,
    "Salario_Diario" DECIMAL(10,2) NOT NULL,
    "Salario_Diario_Integrado" DECIMAL(10,2) NOT NULL,
    "Dias_Trabajados_Pendientes" INTEGER NOT NULL DEFAULT 0,
    "Pago_Dias_Trabajados" DECIMAL(12,2) NOT NULL,
    "Vacaciones_Pendientes" INTEGER NOT NULL DEFAULT 0,
    "Prima_Vacacional" DECIMAL(12,2) NOT NULL,
    "Aguinaldo_Proporcional" DECIMAL(12,2) NOT NULL,
    "Indemnizacion_90_Dias" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Prima_Antiguedad" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Salarios_Vencidos" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Total_Bruto" DECIMAL(12,2) NOT NULL,
    "Deduccion_ISR" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Otras_Deducciones" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Total_Neto" DECIMAL(12,2) NOT NULL,
    "Estado" VARCHAR(20) NOT NULL DEFAULT 'CALCULADO',
    "Aprobado_Por" INTEGER,
    "Fecha_Aprobacion" TIMESTAMP(3),
    "Pagado" BOOLEAN NOT NULL DEFAULT false,
    "Fecha_Pago" TIMESTAMP(3),
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP(3) NOT NULL,
    "CreatedBy" VARCHAR(100),

    CONSTRAINT "Finiquito_Liquidacion_pkey" PRIMARY KEY ("ID_Finiquito")
);

-- CreateTable
CREATE TABLE "Configuracion_Nomina" (
    "ID_Config" SERIAL NOT NULL,
    "Clave" VARCHAR(50) NOT NULL,
    "Valor" VARCHAR(255) NOT NULL,
    "Descripcion" VARCHAR(255),
    "Tipo_Dato" VARCHAR(20) NOT NULL,
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "UpdatedAt" TIMESTAMP(3) NOT NULL,
    "UpdatedBy" VARCHAR(100),

    CONSTRAINT "Configuracion_Nomina_pkey" PRIMARY KEY ("ID_Config")
);

-- CreateTable
CREATE TABLE "Empleados_Prestamos" (
    "ID_Prestamo" SERIAL NOT NULL,
    "ID_Empleado" INTEGER NOT NULL,
    "Tipo_Prestamo" VARCHAR(30) NOT NULL,
    "Monto_Original" DECIMAL(12,2) NOT NULL,
    "Monto_Pendiente" DECIMAL(12,2) NOT NULL,
    "Numero_Pagos" INTEGER NOT NULL,
    "Pagos_Realizados" INTEGER NOT NULL DEFAULT 0,
    "Monto_Por_Pago" DECIMAL(12,2) NOT NULL,
    "Fecha_Inicio" DATE NOT NULL,
    "Fecha_Fin_Estimada" DATE NOT NULL,
    "Estado" VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    "Motivo" VARCHAR(255),
    "Aprobado_Por" INTEGER,
    "Fecha_Aprobacion" TIMESTAMP(3),
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP(3) NOT NULL,
    "CreatedBy" VARCHAR(100),

    CONSTRAINT "Empleados_Prestamos_pkey" PRIMARY KEY ("ID_Prestamo")
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
CREATE UNIQUE INDEX "Cat_Tipo_Incidencia_Codigo_key" ON "Cat_Tipo_Incidencia"("Codigo");

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
CREATE INDEX "Bitacora_Accesos_ID_Usuario_idx" ON "Bitacora_Accesos"("ID_Usuario");

-- CreateIndex
CREATE INDEX "Bitacora_Accesos_FechaHora_idx" ON "Bitacora_Accesos"("FechaHora");

-- CreateIndex
CREATE INDEX "Empleados_Asistencia_ID_Empleado_idx" ON "Empleados_Asistencia"("ID_Empleado");

-- CreateIndex
CREATE INDEX "Empleados_Asistencia_Fecha_idx" ON "Empleados_Asistencia"("Fecha");

-- CreateIndex
CREATE INDEX "Empleados_Asistencia_Ubicacion_Entrada_idx" ON "Empleados_Asistencia"("Ubicacion_Entrada");

-- CreateIndex
CREATE INDEX "Empleados_Asistencia_Ubicacion_Salida_idx" ON "Empleados_Asistencia"("Ubicacion_Salida");

-- CreateIndex
CREATE UNIQUE INDEX "Empleados_Asistencia_ID_Empleado_Fecha_key" ON "Empleados_Asistencia"("ID_Empleado", "Fecha");

-- CreateIndex
CREATE INDEX "Historial_Checadas_ID_Asistencia_idx" ON "Historial_Checadas"("ID_Asistencia");

-- CreateIndex
CREATE INDEX "Historial_Checadas_Tipo_Checada_idx" ON "Historial_Checadas"("Tipo_Checada");

-- CreateIndex
CREATE INDEX "Historial_Checadas_Ubicacion_idx" ON "Historial_Checadas"("Ubicacion");

-- CreateIndex
CREATE INDEX "Historial_Checadas_Fecha_Hora_idx" ON "Historial_Checadas"("Fecha_Hora");

-- CreateIndex
CREATE INDEX "Empleados_Horas_Adicionales_ID_Empleado_idx" ON "Empleados_Horas_Adicionales"("ID_Empleado");

-- CreateIndex
CREATE INDEX "Empleados_Horas_Adicionales_Fecha_idx" ON "Empleados_Horas_Adicionales"("Fecha");

-- CreateIndex
CREATE INDEX "Empleados_Incidencias_ID_Empleado_idx" ON "Empleados_Incidencias"("ID_Empleado");

-- CreateIndex
CREATE INDEX "Empleados_Incidencias_ID_Tipo_Incidencia_idx" ON "Empleados_Incidencias"("ID_Tipo_Incidencia");

-- CreateIndex
CREATE INDEX "Empleados_Incidencias_Fecha_Inicio_idx" ON "Empleados_Incidencias"("Fecha_Inicio");

-- CreateIndex
CREATE INDEX "Empleados_Incidencias_Estado_idx" ON "Empleados_Incidencias"("Estado");

-- CreateIndex
CREATE INDEX "Periodos_Nomina_Estado_idx" ON "Periodos_Nomina"("Estado");

-- CreateIndex
CREATE INDEX "Periodos_Nomina_Fecha_Pago_idx" ON "Periodos_Nomina"("Fecha_Pago");

-- CreateIndex
CREATE UNIQUE INDEX "Periodos_Nomina_Fecha_Inicio_Fecha_Fin_key" ON "Periodos_Nomina"("Fecha_Inicio", "Fecha_Fin");

-- CreateIndex
CREATE INDEX "Nomina_ID_Periodo_idx" ON "Nomina"("ID_Periodo");

-- CreateIndex
CREATE INDEX "Nomina_ID_Empleado_idx" ON "Nomina"("ID_Empleado");

-- CreateIndex
CREATE INDEX "Nomina_Estado_idx" ON "Nomina"("Estado");

-- CreateIndex
CREATE UNIQUE INDEX "Nomina_ID_Periodo_ID_Empleado_key" ON "Nomina"("ID_Periodo", "ID_Empleado");

-- CreateIndex
CREATE INDEX "Vacaciones_ID_Empleado_idx" ON "Vacaciones"("ID_Empleado");

-- CreateIndex
CREATE INDEX "Vacaciones_Estado_idx" ON "Vacaciones"("Estado");

-- CreateIndex
CREATE UNIQUE INDEX "Vacaciones_ID_Empleado_Anio_key" ON "Vacaciones"("ID_Empleado", "Anio");

-- CreateIndex
CREATE INDEX "Aguinaldo_ID_Empleado_idx" ON "Aguinaldo"("ID_Empleado");

-- CreateIndex
CREATE INDEX "Aguinaldo_Anio_idx" ON "Aguinaldo"("Anio");

-- CreateIndex
CREATE UNIQUE INDEX "Aguinaldo_ID_Empleado_Anio_key" ON "Aguinaldo"("ID_Empleado", "Anio");

-- CreateIndex
CREATE INDEX "Finiquito_Liquidacion_ID_Empleado_idx" ON "Finiquito_Liquidacion"("ID_Empleado");

-- CreateIndex
CREATE INDEX "Finiquito_Liquidacion_Tipo_idx" ON "Finiquito_Liquidacion"("Tipo");

-- CreateIndex
CREATE UNIQUE INDEX "Configuracion_Nomina_Clave_key" ON "Configuracion_Nomina"("Clave");

-- CreateIndex
CREATE INDEX "Empleados_Prestamos_ID_Empleado_idx" ON "Empleados_Prestamos"("ID_Empleado");

-- CreateIndex
CREATE INDEX "Empleados_Prestamos_Estado_idx" ON "Empleados_Prestamos"("Estado");

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
ALTER TABLE "App_Usuarios" ADD CONSTRAINT "App_Usuarios_ID_Rol_fkey" FOREIGN KEY ("ID_Rol") REFERENCES "Cat_Roles"("ID_Rol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "App_Usuarios" ADD CONSTRAINT "App_Usuarios_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bitacora_Accesos" ADD CONSTRAINT "Bitacora_Accesos_ID_Usuario_fkey" FOREIGN KEY ("ID_Usuario") REFERENCES "App_Usuarios"("ID_Usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleados_Asistencia" ADD CONSTRAINT "Empleados_Asistencia_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Historial_Checadas" ADD CONSTRAINT "Historial_Checadas_ID_Asistencia_fkey" FOREIGN KEY ("ID_Asistencia") REFERENCES "Empleados_Asistencia"("ID_Asistencia") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleados_Horas_Adicionales" ADD CONSTRAINT "Empleados_Horas_Adicionales_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleados_Horas_Adicionales" ADD CONSTRAINT "Empleados_Horas_Adicionales_Aprobado_Por_fkey" FOREIGN KEY ("Aprobado_Por") REFERENCES "App_Usuarios"("ID_Usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleados_Incidencias" ADD CONSTRAINT "Empleados_Incidencias_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleados_Incidencias" ADD CONSTRAINT "Empleados_Incidencias_ID_Tipo_Incidencia_fkey" FOREIGN KEY ("ID_Tipo_Incidencia") REFERENCES "Cat_Tipo_Incidencia"("ID_Tipo_Incidencia") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleados_Incidencias" ADD CONSTRAINT "Empleados_Incidencias_Aprobado_Por_fkey" FOREIGN KEY ("Aprobado_Por") REFERENCES "App_Usuarios"("ID_Usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Periodos_Nomina" ADD CONSTRAINT "Periodos_Nomina_Cerrado_Por_fkey" FOREIGN KEY ("Cerrado_Por") REFERENCES "App_Usuarios"("ID_Usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomina" ADD CONSTRAINT "Nomina_ID_Periodo_fkey" FOREIGN KEY ("ID_Periodo") REFERENCES "Periodos_Nomina"("ID_Periodo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomina" ADD CONSTRAINT "Nomina_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomina" ADD CONSTRAINT "Nomina_Aprobado_Por_fkey" FOREIGN KEY ("Aprobado_Por") REFERENCES "App_Usuarios"("ID_Usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacaciones" ADD CONSTRAINT "Vacaciones_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacaciones" ADD CONSTRAINT "Vacaciones_Aprobado_Por_fkey" FOREIGN KEY ("Aprobado_Por") REFERENCES "App_Usuarios"("ID_Usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aguinaldo" ADD CONSTRAINT "Aguinaldo_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aguinaldo" ADD CONSTRAINT "Aguinaldo_Calculado_Por_fkey" FOREIGN KEY ("Calculado_Por") REFERENCES "App_Usuarios"("ID_Usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finiquito_Liquidacion" ADD CONSTRAINT "Finiquito_Liquidacion_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finiquito_Liquidacion" ADD CONSTRAINT "Finiquito_Liquidacion_Aprobado_Por_fkey" FOREIGN KEY ("Aprobado_Por") REFERENCES "App_Usuarios"("ID_Usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleados_Prestamos" ADD CONSTRAINT "Empleados_Prestamos_ID_Empleado_fkey" FOREIGN KEY ("ID_Empleado") REFERENCES "Empleados"("ID_Empleado") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleados_Prestamos" ADD CONSTRAINT "Empleados_Prestamos_Aprobado_Por_fkey" FOREIGN KEY ("Aprobado_Por") REFERENCES "App_Usuarios"("ID_Usuario") ON DELETE SET NULL ON UPDATE CASCADE;
