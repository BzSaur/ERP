// Detecta jornadas nocturnas ya registradas: días con entrada sin salida
// (Hora_Salida null) cuya salida quedó en la mañana siguiente. Vuelve a correr
// recalcularJornada (mismo cálculo que ADMS, con vecinos) y reporta los días
// que pasan a nocturna AUTO. RH las confirma o deshace en /asistencia/horas.
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
    Hora_Salida: null,
    Presente: true,
    ...(desde || hasta ? { Fecha: { ...(desde && { gte: new Date(`${desde}T00:00:00Z`) }), ...(hasta && { lte: new Date(`${hasta}T00:00:00Z`) }) } } : {}),
    historial_checadas: { some: {} }
  },
  orderBy: [{ ID_Empleado: 'asc' }, { Fecha: 'asc' }],
  select: { ID_Asistencia: true, ID_Empleado: true, Fecha: true }
});
console.log(`${aplicar ? 'APLICAR' : 'SIMULACRO'}: ${abiertas.length} días sin salida`);

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
        console.log(`  emp ${a.ID_Empleado} ${f.toISOString().slice(0, 10)}: ${hhmm(d.Hora_Entrada)} -> ${hhmm(d.Hora_Salida)} (+1) = ${d.Horas_Trabajadas} h`);
      }
      if (!aplicar) throw new Simulacro();
    }, { timeout: 30000 });
  } catch (e) {
    if (!(e instanceof Simulacro)) { errores++; console.error(`  ERROR asistencia ${a.ID_Asistencia}: ${e.message}`); }
  }
}
console.log(`${aplicar ? 'Nocturnas detectadas' : 'Se detectarían'}: ${nocturnas}. Errores: ${errores}.`);
await prisma.$disconnect();
