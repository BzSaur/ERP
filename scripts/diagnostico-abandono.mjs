/**
 * Diagnóstico de abandono — SOLO LECTURA.
 *
 * Corre detectarAbandono() contra los datos reales y reporta a quién alertaría,
 * SIN cambiar ningún estatus y SIN tocar el checador. No llama a
 * bloquearPorAbandono() en ningún caso.
 *
 * Sirve para validar el criterio (3 faltas consecutivas, saltando sábado y
 * domingo) antes de considerar reactivar el bloqueo automático, que hoy está
 * desactivado en checadorComandosService.js.
 *
 * Uso:
 *   docker exec erp_rh_app node scripts/diagnostico-abandono.mjs
 */

import prisma from '../src/config/database.js';
import { detectarAbandono, FALTAS_CONSECUTIVAS } from '../src/services/abandonoService.js';

const DIAS_VENTANA = 30;

const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
const desde = new Date(hoy); desde.setDate(desde.getDate() - DIAS_VENTANA);
const hace7 = new Date(hoy); hace7.setDate(hace7.getDate() - 7);
const ymd = (d) => d ? new Date(d).toISOString().slice(0, 10) : '---';

// --- Salud del checador: sin esto, las "faltas" no significan nada ---------
const [jornadas, jornadas7, activos, porEstatus] = await Promise.all([
  prisma.empleados_Asistencia.count({ where: { Fecha: { gte: desde, lte: hoy }, Presente: true } }),
  prisma.empleados_Asistencia.count({ where: { Fecha: { gte: hace7, lte: hoy }, Presente: true } }),
  prisma.empleados.count({ where: { estatus: { is: { Nombre_Estatus: 'ACTIVO' } } } }),
  prisma.empleados.groupBy({ by: ['ID_Estatus'], _count: true })
]);
const distintos = await prisma.empleados_Asistencia.groupBy({
  by: ['ID_Empleado'], where: { Fecha: { gte: desde, lte: hoy }, Presente: true }
});

const estatusCat = await prisma.cat_Estatus_Empleado.findMany({
  select: { ID_Estatus: true, Nombre_Estatus: true }
});
const nombreEstatus = new Map(estatusCat.map(e => [e.ID_Estatus, e.Nombre_Estatus]));

console.log('='.repeat(64));
console.log('DIAGNOSTICO ABANDONO (solo lectura, no modifica nada)');
console.log('='.repeat(64));
console.log('Ventana        :', ymd(desde), '->', ymd(hoy), `(${DIAS_VENTANA} dias)`);
console.log('Umbral         :', FALTAS_CONSECUTIVAS, 'faltas consecutivas (salta sabado y domingo)');
console.log('\n-- Salud del checador --');
console.log('Jornadas presentes en ventana :', jornadas);
console.log('Jornadas presentes ult. 7 dias:', jornadas7);
console.log('Empleados distintos con checada:', distintos.length, 'de', activos, 'activos');
console.log('Plantilla por estatus:',
  porEstatus.map(p => `${nombreEstatus.get(p.ID_Estatus) || p.ID_Estatus}=${p._count}`).join(' '));

if (jornadas === 0) {
  console.log('\n>> SIN CHECADAS EN LA VENTANA. Las faltas serian un fallo de');
  console.log('   sincronizacion, no ausencias. El diagnostico no es concluyente.');
}

// --- Alertas ---------------------------------------------------------------
const alertas = await detectarAbandono();
const pct = activos > 0 ? Math.round(alertas.length / activos * 100) : 0;

console.log('\n-- Alertas --');
console.log('ALERTADOS:', alertas.length, `= ${pct}% de los activos`);

if (alertas.length) {
  // Última checada real de cada alertado: si es reciente, la racha no es vigente
  // y algo quedó mal en la detección.
  const ult = await prisma.empleados_Asistencia.groupBy({
    by: ['ID_Empleado'],
    where: { ID_Empleado: { in: alertas.map(a => a.ID_Empleado) }, Presente: true },
    _max: { Fecha: true }
  });
  const mapUlt = new Map(ult.map(u => [u.ID_Empleado, u._max.Fecha]));

  console.log('\n  ID   Empleado                        Cons Total  Racha                  Ult.checada');
  console.log('  ' + '-'.repeat(86));
  for (const a of alertas.slice(0, 25)) {
    console.log(
      '  ' + String(a.ID_Empleado).padStart(4),
      (a.nombre || '').slice(0, 30).padEnd(32),
      String(a.consecutivas).padStart(4),
      String(a.totalFaltas).padStart(5),
      ' ' + a.rachaDesde + '->' + a.rachaHasta,
      ' ' + ymd(mapUlt.get(a.ID_Empleado))
    );
  }
  if (alertas.length > 25) console.log('  ... +' + (alertas.length - 25) + ' mas');

  const dist = {};
  for (const a of alertas) dist[a.consecutivas] = (dist[a.consecutivas] || 0) + 1;
  console.log('\n  Distribucion de rachas:',
    Object.entries(dist).sort((x, y) => y[0] - x[0]).map(([k, v]) => `${k}d=${v}`).join(' '));
}

// --- Qué haría bloquearPorAbandono, sin ejecutarlo -------------------------
console.log('\n-- Simulacion de guardas (bloquearPorAbandono NO se ejecuta) --');
let frenado = null;
if (!alertas.length) frenado = 'No hay alertas.';
else if (jornadas7 === 0) frenado = 'Guarda 1: cero checadas en los ultimos 7 dias.';
else if (activos > 0 && alertas.length > activos * 0.5) {
  frenado = `Guarda 2: ${alertas.length} alertados > 50% de ${activos} activos.`;
}

if (frenado) {
  console.log('BLOQUEARIA: 0 empleados');
  console.log('Motivo    :', frenado);
} else {
  console.log('BLOQUEARIA:', alertas.length, 'empleados -> pasarian a SUSPENDIDO');
  console.log('Motivo    : ninguna guarda frena esta corrida.');
  console.log('IDs       :', alertas.map(a => a.ID_Empleado).join(', '));
}

console.log('\n(no se modifico ningun estatus)');
await prisma.$disconnect();
process.exit(0);
