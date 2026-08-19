-- Encargado dueño de la regla recurrente. Antes solo se podía inferir por el
-- grupo, que es opcional: las reglas sin grupo quedaban sin responsable.
ALTER TABLE "Actividad_Recurrencias" ADD COLUMN "ID_Responsable" INTEGER;

CREATE INDEX "Actividad_Recurrencias_ID_Responsable_idx"
  ON "Actividad_Recurrencias"("ID_Responsable");

ALTER TABLE "Actividad_Recurrencias"
  ADD CONSTRAINT "Actividad_Recurrencias_ID_Responsable_fkey"
  FOREIGN KEY ("ID_Responsable") REFERENCES "Empleados"("ID_Empleado")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: las reglas que sí tienen grupo heredan el encargado de ese grupo.
UPDATE "Actividad_Recurrencias" r
SET "ID_Responsable" = e."ID_Empleado"
FROM "Grupos" g
JOIN "Cat_Encargados" e ON e."ID_Encargado_Cat" = g."ID_Encargado"
WHERE r."ID_Grupo" = g."ID_Grupo" AND r."ID_Responsable" IS NULL;
