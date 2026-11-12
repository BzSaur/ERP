// Detecta jornadas nocturnas ya registradas: días con entrada sin salida
// (Hora_Salida null) cuya salida quedó en la mañana siguiente, y recalcula las
// que ya estaban como AUTO. Vuelve a correr recalcularJornada (mismo cálculo que
// ADMS, con vecinos) y reporta las nocturnas AUTO: quedan pendientes (no suman
// horas) hasta que RH diga "Sí" en /asistencia/horas.
//
// Uso (dentro del container, para heredar TZ America/Mexico_City):
//   docker exec erp_rh_app node scripts/detectar-jornadas-nocturnas.js            # simulacro
//   docker exec erp_rh_app node scripts/detectar-jornadas-nocturnas.js --aplicar
//   ... --desde=2026-10-19 --hasta=2026-11-12
import prisma from '../src/config/database.js';
import { recalcularJornada } from '../src/services/admsService.js';

const arg = (n) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const aplicar = process.argv.includes('--aplicar');
const desde = arg('desde');
const hasta = arg('hasta');

class Simulacro extends Error {}

const abiertas = await prisma.empleados_Asistencia.findMany({
  where: {
    OR: [{ Hora_Salida: null, Presente: true }, { Nocturna_Estado: 'AUTO' }],
    ...(desde || hasta ? { Fecha: { ...(desde && { gte: new Date(`${desde}T00:00:00Z`) }), ...(hasta && { lte: new Date(`${hasta}T00:00:00Z`) }) } } : {}),
    historial_checadas: { some: {} }
  },
  orderBy: [{ ID_Empleado: 'asc' }, { Fecha: 'asc' }],
  select: { ID_Asistencia: true, ID_Empleado: true, Fecha: true }
});
console.log(`${aplicar ? 'APLICAR' : 'SIMULACRO'}: ${abiertas.length} días sin salida o nocturna AUTO`);

let nocturnas = 0, errores = 0;
for (const a of abiertas) {
  const f = a.Fecha; // @db.Date llega 00:00Z -> día local con getUTC*
  const fechaDia = new Date(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate());
  try {
    await prisma.$transaction(async (tx) => {
      await recalcularJornada(tx, a.ID_Asistencia, a.ID_Empleado, fechaDia);
      const d = await tx.empleados_Asistencia.findUnique({
        where: { ID_Asistencia: a.ID_Asistencia },
        select: { Nocturna_Estado: true, Hora_Entrada: true, Hora_Salida: true, Horas_Trabajadas: true }
      });
      if (d.Nocturna_Estado === 'AUTO') {
        nocturnas++;
        const hhmm = (x) => x ? x.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '--:--';
        console.log(`  emp ${a.ID_Empleado} ${f.toISOString().slice(0, 10)}: ${hhmm(d.Hora_Entrada)} -> ${hhmm(d.Hora_Salida)} (+1), por confirmar`);
      }
      if (!aplicar) throw new Simulacro();
    }, { timeout: 30000 });
  } catch (e) {
    if (!(e instanceof Simulacro)) { errores++; console.error(`  ERROR asistencia ${a.ID_Asistencia}: ${e.message}`); }
  }
}
console.log(`${aplicar ? 'Nocturnas detectadas' : 'Se detectarían'}: ${nocturnas}. Errores: ${errores}.`);
await prisma.$disconnect();
