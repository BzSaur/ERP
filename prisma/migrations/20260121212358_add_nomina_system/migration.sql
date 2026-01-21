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
CREATE TABLE "Dias_Festivos" (
    "ID_Festivo" SERIAL NOT NULL,
    "Fecha" DATE NOT NULL,
    "Nombre" VARCHAR(100) NOT NULL,
    "Obligatorio" BOOLEAN NOT NULL DEFAULT true,
    "Anio" INTEGER NOT NULL,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dias_Festivos_pkey" PRIMARY KEY ("ID_Festivo")
);

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
CREATE INDEX "Dias_Festivos_Anio_idx" ON "Dias_Festivos"("Anio");

-- CreateIndex
CREATE UNIQUE INDEX "Dias_Festivos_Fecha_key" ON "Dias_Festivos"("Fecha");

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
