/**
 * backfill-vacaciones-periodos.js
 * Copia los rangos legacy de Vacaciones (Fecha_Inicio/Fin del último periodo,
 * Estado EN_CURSO/TOMADAS) a Vacaciones_Periodos, si no existe ya un periodo
 * idéntico. A partir de este backfill, el histórico vive en Vacaciones_Periodos.
 *
 * Uso:
 *   node scripts/backfill-vacaciones-periodos.js            (dry-run)
 *   node scripts/backfill-vacaciones-periodos.js --aplicar  (escribe)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APLICAR = process.argv.includes('--aplicar');

async function main() {
  console.log(`Modo: ${APLICAR ? 'APLICAR (escribe BD)' : 'DRY-RUN (usa --aplicar para escribir)'}\n`);

  const legacy = await prisma.vacaciones.findMany({
    where: {
      Estado: { in: ['EN_CURSO', 'TOMADAS'] },
      Fecha_Inicio: { not: null },
      Fecha_Fin: { not: null }
    },
    include: { empleado: { select: { Nombre: true, Apellido_Paterno: true } } }
  });

  console.log(`Registros legacy con fechas: ${legacy.length}`);
  let creados = 0, saltados = 0;

  for (const v of legacy) {
    const existente = await prisma.vacaciones_Periodos.findFirst({
      where: {
        ID_Vacacion: v.ID_Vacacion,
        Fecha_Inicio: v.Fecha_Inicio,
        Fecha_Fin: v.Fecha_Fin
      }
    });
    const nombre = `${v.empleado.Nombre} ${v.empleado.Apellido_Paterno}`;
    const rango = `${v.Fecha_Inicio.toISOString().slice(0, 10)} a ${v.Fecha_Fin.toISOString().slice(0, 10)}`;
    if (existente) {
      console.log(`  = ya existe: ${nombre} | ${rango}`);
      saltados++;
      continue;
    }

    const dias = Math.ceil((v.Fecha_Fin - v.Fecha_Inicio) / (1000 * 60 * 60 * 24)) + 1;
    console.log(`  + crear: ${nombre} | ${rango} | ${dias} día(s)`);
    if (APLICAR) {
      await prisma.vacaciones_Periodos.create({
        data: {
          ID_Vacacion: v.ID_Vacacion,
          ID_Empleado: v.ID_Empleado,
          Fecha_Inicio: v.Fecha_Inicio,
          Fecha_Fin: v.Fecha_Fin,
          Dias: dias,
          Estado: 'APROBADO',
          Aprobado_Por: v.Aprobado_Por || null,
          Observaciones: v.Observaciones || null,
          CreatedBy: 'backfill'
        }
      });
    }
    creados++;
  }

  console.log(`\n${APLICAR ? 'Creados' : 'Se crearían'}: ${creados} | Ya existían: ${saltados}`);
  if (!APLICAR && creados > 0) console.log('Ejecuta con --aplicar para confirmar.');
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
