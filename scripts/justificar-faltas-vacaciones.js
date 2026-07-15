/**
 * justificar-faltas-vacaciones.js
 * Limpieza de datos: marca Justificado=true en faltas (Presente=false) cuya fecha
 * cae dentro de un periodo de vacaciones (EN_CURSO/TOMADAS) o de una incidencia
 * APROBADA del empleado. Esas faltas las creó marcarFaltasAutomaticas antes de
 * que validara vacaciones, y descuentan nómina y aguinaldo indebidamente.
 *
 * NO borra registros: solo marca Justificado y anota el motivo en Notas.
 *
 * Uso:
 *   node scripts/justificar-faltas-vacaciones.js            (dry-run: solo reporta)
 *   node scripts/justificar-faltas-vacaciones.js --aplicar  (escribe cambios)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APLICAR = process.argv.includes('--aplicar');

// Día calendario YYYYMMDD con partes UTC: todas las columnas involucradas son
// @db.Date (se leen a medianoche UTC). Mismo helper que asistenciaService.
const ymdUTC = d => { const x = new Date(d); return x.getUTCFullYear() * 10000 + (x.getUTCMonth() + 1) * 100 + x.getUTCDate(); };

async function main() {
  console.log(`Modo: ${APLICAR ? 'APLICAR (escribe BD)' : 'DRY-RUN (solo reporte; usa --aplicar para escribir)'}\n`);

  const [vacaciones, incidencias, faltas] = await Promise.all([
    prisma.vacaciones.findMany({
      where: { Estado: { in: ['EN_CURSO', 'TOMADAS'] }, Fecha_Inicio: { not: null }, Fecha_Fin: { not: null } },
      select: { ID_Empleado: true, Fecha_Inicio: true, Fecha_Fin: true }
    }),
    prisma.empleados_Incidencias.findMany({
      where: { Estado: 'APROBADA' },
      select: { ID_Empleado: true, Fecha_Inicio: true, Fecha_Fin: true, tipo_incidencia: { select: { Nombre: true } } }
    }),
    prisma.empleados_Asistencia.findMany({
      where: { Presente: false, Justificado: false },
      select: {
        ID_Asistencia: true, ID_Empleado: true, Fecha: true, Notas: true,
        empleado: { select: { Nombre: true, Apellido_Paterno: true } }
      }
    })
  ]);

  // Periodos por empleado
  const periodos = new Map();
  const agregar = (id, ini, fin, etiqueta) => {
    if (!periodos.has(id)) periodos.set(id, []);
    periodos.get(id).push({ desde: ymdUTC(ini), hasta: ymdUTC(fin), etiqueta });
  };
  for (const v of vacaciones) agregar(v.ID_Empleado, v.Fecha_Inicio, v.Fecha_Fin, 'Vacaciones');
  for (const i of incidencias) agregar(i.ID_Empleado, i.Fecha_Inicio, i.Fecha_Fin, i.tipo_incidencia?.Nombre || 'Incidencia aprobada');

  console.log(`Periodos: ${vacaciones.length} de vacaciones, ${incidencias.length} de incidencias.`);
  console.log(`Faltas sin justificar en BD: ${faltas.length}\n`);

  const aJustificar = [];
  for (const f of faltas) {
    const pers = periodos.get(f.ID_Empleado);
    if (!pers) continue;
    const ymd = ymdUTC(f.Fecha);
    const p = pers.find(p => ymd >= p.desde && ymd <= p.hasta);
    if (p) aJustificar.push({ ...f, etiqueta: p.etiqueta });
  }

  if (aJustificar.length === 0) {
    console.log('Nada que corregir: ninguna falta cae en periodo de vacaciones/incidencia.');
    return;
  }

  console.log(`Faltas a justificar: ${aJustificar.length}\n`);
  for (const f of aJustificar) {
    const nombre = `${f.empleado?.Nombre || ''} ${f.empleado?.Apellido_Paterno || ''}`.trim() || `Empleado ${f.ID_Empleado}`;
    const fecha = new Date(f.Fecha).toLocaleDateString('es-MX');
    console.log(`  [${f.ID_Asistencia}] ${nombre} — ${fecha} → ${f.etiqueta}`);
  }

  if (!APLICAR) {
    console.log('\nDry-run: no se escribió nada. Ejecuta con --aplicar para confirmar.');
    return;
  }

  let actualizadas = 0;
  for (const f of aJustificar) {
    const notaExtra = `Justificada por script: ${f.etiqueta}`;
    await prisma.empleados_Asistencia.update({
      where: { ID_Asistencia: f.ID_Asistencia },
      data: {
        Justificado: true,
        Notas: f.Notas ? `${f.Notas} | ${notaExtra}`.slice(0, 500) : notaExtra
      }
    });
    actualizadas++;
  }
  console.log(`\nListo: ${actualizadas} falta(s) marcadas como justificadas.`);
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
