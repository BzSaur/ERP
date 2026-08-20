-- Permitir varias actividades el mismo día para un empleado (ej. home office
-- por la mañana + capacitación por la tarde). Antes solo se admitía una.
-- La unicidad pasa a ser por actividad+empleado+día: la MISMA actividad no se
-- duplica en el mismo día, pero sí conviven actividades distintas.
DROP INDEX IF EXISTS "Actividad_Asignaciones_ID_Empleado_Fecha_key";

CREATE UNIQUE INDEX "Actividad_Asignaciones_ID_Actividad_ID_Empleado_Fecha_key"
  ON "Actividad_Asignaciones"("ID_Actividad", "ID_Empleado", "Fecha");

-- Índice compuesto: la resolución por día consulta por empleado+fecha.
CREATE INDEX "Actividad_Asignaciones_ID_Empleado_Fecha_idx"
  ON "Actividad_Asignaciones"("ID_Empleado", "Fecha");
