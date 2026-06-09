-- AlterTable
ALTER TABLE "Empleados_Asistencia" ADD COLUMN     "ID_Checador_Entrada" INTEGER,
ADD COLUMN     "ID_Checador_Salida" INTEGER,
ADD COLUMN     "Multi_Planta" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Historial_Checadas" ADD COLUMN     "Hash_Checada" VARCHAR(64),
ADD COLUMN     "ID_Checador" INTEGER,
ADD COLUMN     "Origen_Sincronizacion" VARCHAR(20) NOT NULL DEFAULT 'ADMS_PUSH',
ADD COLUMN     "Tipo_Verificacion" INTEGER;

-- CreateTable
CREATE TABLE "Cat_Plantas" (
    "ID_Planta" SERIAL NOT NULL,
    "Nombre" VARCHAR(50) NOT NULL,
    "Direccion" VARCHAR(200),
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cat_Plantas_pkey" PRIMARY KEY ("ID_Planta")
);

-- CreateTable
CREATE TABLE "Checadores" (
    "ID_Checador" SERIAL NOT NULL,
    "Serial_Number" VARCHAR(50) NOT NULL,
    "Nombre" VARCHAR(50) NOT NULL,
    "ID_Planta" INTEGER NOT NULL,
    "Ubicacion_Codigo" VARCHAR(20),
    "Ubicacion_Detalle" VARCHAR(100),
    "IP_Local" VARCHAR(45),
    "Modelo" VARCHAR(30) NOT NULL DEFAULT 'CLK-980',
    "Firmware" VARCHAR(50),
    "Ultima_Conexion" TIMESTAMP(3),
    "Ultima_IP_Origen" VARCHAR(45),
    "Offset_Tiempo_Min" INTEGER NOT NULL DEFAULT 0,
    "Estado_Registro" VARCHAR(20) NOT NULL DEFAULT 'aprobado',
    "Activo" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checadores_pkey" PRIMARY KEY ("ID_Checador")
);

-- CreateTable
CREATE TABLE "Checadores_Comandos" (
    "ID_Comando" SERIAL NOT NULL,
    "ID_Checador" INTEGER NOT NULL,
    "Comando" TEXT NOT NULL,
    "Tipo_Comando" VARCHAR(30) NOT NULL,
    "ID_Empleado" INTEGER,
    "Estatus" VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    "Intentos" INTEGER NOT NULL DEFAULT 0,
    "Fecha_Creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "Fecha_Enviado" TIMESTAMP(3),
    "Respuesta" TEXT,

    CONSTRAINT "Checadores_Comandos_pkey" PRIMARY KEY ("ID_Comando")
);

-- CreateTable
CREATE TABLE "ADMS_Logs" (
    "ID_Log" SERIAL NOT NULL,
    "SN" VARCHAR(50),
    "Endpoint" VARCHAR(50) NOT NULL,
    "Body_Size" INTEGER,
    "Response_Code" INTEGER NOT NULL,
    "Processing_Ms" INTEGER,
    "Error" TEXT,
    "Fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ADMS_Logs_pkey" PRIMARY KEY ("ID_Log")
);

-- CreateTable
CREATE TABLE "Checadas_Huerfanas" (
    "ID_Huerfana" SERIAL NOT NULL,
    "PIN_Reportado" VARCHAR(50) NOT NULL,
    "ID_Checador" INTEGER NOT NULL,
    "Fecha_Hora" TIMESTAMP(3) NOT NULL,
    "Tipo_Verificacion" INTEGER,
    "Resuelto" BOOLEAN NOT NULL DEFAULT false,
    "ID_Empleado_Resuelto" INTEGER,
    "Fecha_Creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checadas_Huerfanas_pkey" PRIMARY KEY ("ID_Huerfana")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cat_Plantas_Nombre_key" ON "Cat_Plantas"("Nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Checadores_Serial_Number_key" ON "Checadores"("Serial_Number");

-- CreateIndex
CREATE INDEX "Checadores_Serial_Number_idx" ON "Checadores"("Serial_Number");

-- CreateIndex
CREATE INDEX "Checadores_ID_Planta_idx" ON "Checadores"("ID_Planta");

-- CreateIndex
CREATE INDEX "Checadores_Comandos_Estatus_ID_Checador_idx" ON "Checadores_Comandos"("Estatus", "ID_Checador");

-- CreateIndex
CREATE INDEX "ADMS_Logs_SN_Fecha_idx" ON "ADMS_Logs"("SN", "Fecha");

-- CreateIndex
CREATE INDEX "ADMS_Logs_Fecha_idx" ON "ADMS_Logs"("Fecha");

-- CreateIndex
CREATE INDEX "Checadas_Huerfanas_Resuelto_idx" ON "Checadas_Huerfanas"("Resuelto");

-- CreateIndex
CREATE UNIQUE INDEX "Historial_Checadas_Hash_Checada_key" ON "Historial_Checadas"("Hash_Checada");

-- CreateIndex
CREATE INDEX "Historial_Checadas_ID_Checador_idx" ON "Historial_Checadas"("ID_Checador");

-- AddForeignKey
ALTER TABLE "Empleados_Asistencia" ADD CONSTRAINT "Empleados_Asistencia_ID_Checador_Entrada_fkey" FOREIGN KEY ("ID_Checador_Entrada") REFERENCES "Checadores"("ID_Checador") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleados_Asistencia" ADD CONSTRAINT "Empleados_Asistencia_ID_Checador_Salida_fkey" FOREIGN KEY ("ID_Checador_Salida") REFERENCES "Checadores"("ID_Checador") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Historial_Checadas" ADD CONSTRAINT "Historial_Checadas_ID_Checador_fkey" FOREIGN KEY ("ID_Checador") REFERENCES "Checadores"("ID_Checador") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checadores" ADD CONSTRAINT "Checadores_ID_Planta_fkey" FOREIGN KEY ("ID_Planta") REFERENCES "Cat_Plantas"("ID_Planta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checadores_Comandos" ADD CONSTRAINT "Checadores_Comandos_ID_Checador_fkey" FOREIGN KEY ("ID_Checador") REFERENCES "Checadores"("ID_Checador") ON DELETE CASCADE ON UPDATE CASCADE;

