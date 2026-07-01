-- CreateTable
CREATE TABLE "Consultor_Plantas" (
    "ID_Usuario" INTEGER NOT NULL,
    "ID_Planta" INTEGER NOT NULL,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consultor_Plantas_pkey" PRIMARY KEY ("ID_Usuario","ID_Planta")
);

-- CreateTable
CREATE TABLE "Consultor_Areas" (
    "ID_Usuario" INTEGER NOT NULL,
    "ID_Area" INTEGER NOT NULL,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consultor_Areas_pkey" PRIMARY KEY ("ID_Usuario","ID_Area")
);

-- CreateIndex
CREATE INDEX "Consultor_Plantas_ID_Usuario_idx" ON "Consultor_Plantas"("ID_Usuario");

-- CreateIndex
CREATE INDEX "Consultor_Areas_ID_Usuario_idx" ON "Consultor_Areas"("ID_Usuario");

-- AddForeignKey
ALTER TABLE "Consultor_Plantas" ADD CONSTRAINT "Consultor_Plantas_ID_Usuario_fkey" FOREIGN KEY ("ID_Usuario") REFERENCES "App_Usuarios"("ID_Usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultor_Plantas" ADD CONSTRAINT "Consultor_Plantas_ID_Planta_fkey" FOREIGN KEY ("ID_Planta") REFERENCES "Cat_Plantas"("ID_Planta") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultor_Areas" ADD CONSTRAINT "Consultor_Areas_ID_Usuario_fkey" FOREIGN KEY ("ID_Usuario") REFERENCES "App_Usuarios"("ID_Usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultor_Areas" ADD CONSTRAINT "Consultor_Areas_ID_Area_fkey" FOREIGN KEY ("ID_Area") REFERENCES "Cat_Areas"("ID_Area") ON DELETE CASCADE ON UPDATE CASCADE;
