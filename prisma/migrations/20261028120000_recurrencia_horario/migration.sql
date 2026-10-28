-- Tramo horario de la regla recurrente (minutos desde medianoche; Hora_Fin
-- > 1440 = termina al día siguiente). Sin backfill: null = jornada implícita,
-- así que las reglas existentes conservan su comportamiento.
ALTER TABLE "Actividad_Recurrencias" ADD COLUMN "Hora_Inicio" INTEGER;
ALTER TABLE "Actividad_Recurrencias" ADD COLUMN "Hora_Fin" INTEGER;
