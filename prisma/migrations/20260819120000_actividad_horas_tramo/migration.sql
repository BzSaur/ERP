-- Tramo horario opcional de cada día de actividad asignado.
-- Minutos desde medianoche (480 = 8:00). NULL en ambos = jornada implícita
-- (9h fijas sin checada, u 8:00→primera checada con ella).
ALTER TABLE "Actividad_Asignaciones" ADD COLUMN "Hora_Inicio" INTEGER;
ALTER TABLE "Actividad_Asignaciones" ADD COLUMN "Hora_Fin" INTEGER;
