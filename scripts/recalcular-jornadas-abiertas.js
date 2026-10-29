// Corrige jornadas con cantidad impar de checadas (entra, sale, regresa) que
// quedaron con Hora_Salida = la última checada. Vuelve a correr recalcularJornada
// sobre los días con 3+ checadas y reporta cuáles cambian.
//
// Uso (dentro del container, para heredar TZ America/Mexico_City):
//   docker exec erp_rh_app node scripts/recalcular-jornadas-abiertas.js            # simulacro
//   docker exec erp_rh_app node scripts/recalcular-jornadas-abiertas.js --aplicar
//   ... --desde=2026-09-01 --hasta=2026-10-31
import prisma from '../src/config/database.js';
import { recalcularJornada } from '../src/services/admsService.js';

const arg = (n) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const aplicar = process.argv.includes('--aplicar');
const desde = arg('desde');
const hasta = arg('hasta');

class Simulacro extends Error {}

const asistencias = await prisma.empleados_Asistencia.findMany({
  where: {
    Hora_Salida: { not: null },
    ...(desde || hasta ? { Fecha: { ...(desde && { gte: new Date(`${desde}T00:00:00Z`) }), ...(hasta && { lte: new Date(`${hasta}T00:00:00Z`) }) } } : {}),
    historial_checadas: { some: {} }
  },
  select: {
    ID_Asistencia: true, ID_Empleado: true, Fecha: true, Hora_Salida: true,
    _count: { select: { historial_checadas: true } }
  }
});
const candidatas = asistencias.filter(a => a._count.historial_checadas >= 3);
console.log(`${aplicar ? 'APLICAR' : 'SIMULACRO'}: ${candidatas.length} días con 3+ checadas (de ${asistencias.length} con salida)`);

let corregidos = 0, errores = 0;
for (const a of candidatas) {
  const f = a.Fecha; // @db.Date llega 00:00Z -> día local con getUTC*
  const fechaDia = new Date(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate());
  try {
    await prisma.$transaction(async (tx) => {
      const emp = await tx.empleados.findUnique({ where: { ID_Empleado: a.ID_Empleado } });
      await recalcularJornada(tx, a.ID_Asistencia, a.ID_Empleado, fechaDia, emp);
      const despues = await tx.empleados_Asistencia.findUnique({ where: { ID_Asistencia: a.ID_Asistencia }, select: { Hora_Salida: true } });
      if (a.Hora_Salida && !despues.Hora_Salida) {
        corregidos++;
        console.log(`  emp ${a.ID_Empleado} ${f.toISOString().slice(0, 10)}: salida ${a.Hora_Salida.toLocaleTimeString('es-MX')} -> sin salida`);
      }
      if (!aplicar) throw new Simulacro();
    });
  } catch (e) {
    if (!(e instanceof Simulacro)) { errores++; console.error(`  ERROR asistencia ${a.ID_Asistencia}: ${e.message}`); }
  }
}
console.log(`${aplicar ? 'Corregidos' : 'Se corregirían'}: ${corregidos}. Errores: ${errores}.`);
await prisma.$disconnect();
