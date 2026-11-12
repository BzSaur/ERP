// Recalcula Horas_Trabajadas de las jornadas guardadas con la regla anterior de
// redondeo restrictivo (desde el 19-oct-2026). Antes solo la PRIMERA entrada del
// día pasaba por la tolerancia; ahora toda entrada pasa por ella (dentro cuenta
// la hora, fuera no) y el día siempre da horas completas.
//
// Solo cambian días con 3+ checadas (salió y regresó): con un solo par la regla
// es la misma. Vuelve a correr recalcularJornada (misma lógica que ADMS) sobre
// esos días y reporta cuáles cambian.
//
// Uso (dentro del container, para heredar TZ America/Mexico_City):
//   docker exec erp_rh_app node scripts/recalcular-horas-tolerancia.js            # simulacro, no escribe
//   docker exec erp_rh_app node scripts/recalcular-horas-tolerancia.js --aplicar
//   ... --desde=2026-10-19 --hasta=2026-11-30
import prisma from '../src/config/database.js';
import { recalcularJornada } from '../src/services/admsService.js';

const arg = (n) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const aplicar = process.argv.includes('--aplicar');
// Corte de la regla restrictiva (FECHA_REDONDEO_RESTRICTIVO en checadorImportService).
// Antes de esa fecha recalcularJornada usa la regla vieja: no hay nada que corregir.
const desde = arg('desde') || '2026-10-19';
const hasta = arg('hasta');

class Simulacro extends Error {}

const asistencias = await prisma.empleados_Asistencia.findMany({
  where: {
    Fecha: { gte: new Date(`${desde}T00:00:00Z`), ...(hasta && { lte: new Date(`${hasta}T00:00:00Z`) }) },
    historial_checadas: { some: {} }
  },
  select: {
    ID_Asistencia: true, ID_Empleado: true, Fecha: true, Horas_Trabajadas: true, Hora_Salida: true,
    _count: { select: { historial_checadas: true } }
  },
  orderBy: [{ Fecha: 'asc' }, { ID_Empleado: 'asc' }]
});
const candidatas = asistencias.filter(a => a._count.historial_checadas >= 3);
console.log(`${aplicar ? 'APLICAR' : 'SIMULACRO (usa --aplicar para escribir)'}: desde ${desde}${hasta ? ' hasta ' + hasta : ''}`);
console.log(`${candidatas.length} días con 3+ checadas (de ${asistencias.length} con checadas)\n`);

const fmtH = (h) => { const t = Math.round((Number(h) || 0) * 60); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
let cambiados = 0, errores = 0, difMinTotal = 0;
for (const a of candidatas) {
  const f = a.Fecha; // @db.Date llega 00:00Z -> día local con getUTC*
  const fechaDia = new Date(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate());
  try {
    await prisma.$transaction(async (tx) => {
      const emp = await tx.empleados.findUnique({ where: { ID_Empleado: a.ID_Empleado } });
      await recalcularJornada(tx, a.ID_Asistencia, a.ID_Empleado, fechaDia, emp);
      const despues = await tx.empleados_Asistencia.findUnique({
        where: { ID_Asistencia: a.ID_Asistencia },
        select: { Horas_Trabajadas: true, Hora_Salida: true }
      });
      const antes = Number(a.Horas_Trabajadas) || 0;
      const ahora = Number(despues.Horas_Trabajadas) || 0;
      const salidaCambio = !!a.Hora_Salida !== !!despues.Hora_Salida;
      if (Math.abs(antes - ahora) > 0.001 || salidaCambio) {
        cambiados++;
        difMinTotal += Math.round((ahora - antes) * 60);
        console.log(`  emp ${a.ID_Empleado} ${f.toISOString().slice(0, 10)}: ${fmtH(antes)} -> ${fmtH(ahora)}`
          + (salidaCambio ? ` (salida: ${a.Hora_Salida ? 'sí' : 'no'} -> ${despues.Hora_Salida ? 'sí' : 'no'})` : ''));
      }
      if (!aplicar) throw new Simulacro(); // revierte la transacción
    });
  } catch (e) {
    if (!(e instanceof Simulacro)) { errores++; console.error(`  ERROR asistencia ${a.ID_Asistencia}: ${e.message}`); }
  }
}
const signo = difMinTotal < 0 ? '-' : '+';
console.log(`\n${aplicar ? 'Recalculados' : 'Cambiarían'}: ${cambiados} días. Diferencia neta: ${signo}${fmtH(Math.abs(difMinTotal) / 60)} h. Errores: ${errores}.`);
await prisma.$disconnect();
