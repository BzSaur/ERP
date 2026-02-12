-- CreateTable
CREATE TABLE "Bitacora_Cambios" (
    "ID_Cambio" SERIAL NOT NULL,
    "ID_Usuario" INTEGER NOT NULL,
    "Email_Usuario" VARCHAR(100) NOT NULL,
    "Rol_Usuario" VARCHAR(50) NOT NULL,
    "Accion" VARCHAR(20) NOT NULL,
    "Tabla" VARCHAR(100) NOT NULL,
    "ID_Registro" VARCHAR(50) NOT NULL,
    "Descripcion" TEXT NOT NULL,
    "Datos_Previos" JSONB,
    "Datos_Nuevos" JSONB,
    "IP_Usuario" VARCHAR(45),
    "FechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bitacora_Cambios_pkey" PRIMARY KEY ("ID_Cambio")
);

-- CreateIndex
CREATE INDEX "Bitacora_Cambios_ID_Usuario_idx" ON "Bitacora_Cambios"("ID_Usuario");

-- CreateIndex
CREATE INDEX "Bitacora_Cambios_Tabla_idx" ON "Bitacora_Cambios"("Tabla");

-- CreateIndex
CREATE INDEX "Bitacora_Cambios_Accion_idx" ON "Bitacora_Cambios"("Accion");

-- CreateIndex
CREATE INDEX "Bitacora_Cambios_FechaHora_idx" ON "Bitacora_Cambios"("FechaHora");

-- AddForeignKey
ALTER TABLE "Bitacora_Cambios" ADD CONSTRAINT "Bitacora_Cambios_ID_Usuario_fkey" FOREIGN KEY ("ID_Usuario") REFERENCES "App_Usuarios"("ID_Usuario") ON DELETE CASCADE ON UPDATE CASCADE;
