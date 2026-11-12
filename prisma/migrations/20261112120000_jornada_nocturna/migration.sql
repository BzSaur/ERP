-- Jornada nocturna (cruza medianoche). Sin backfill: null/false = día normal;
-- scripts/recalcular-jornadas-abiertas.js detecta las nocturnas ya registradas.
ALTER TABLE "Empleados_Asistencia" ADD COLUMN "Nocturna_Estado" VARCHAR(12);
ALTER TABLE "Empleados_Asistencia" ADD COLUMN "Nocturna_Entrante" BOOLEAN NOT NULL DEFAULT false;
