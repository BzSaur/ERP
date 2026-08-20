import prisma from './src/config/database.js';
import { obtenerHorasSemanalTodos } from './src/services/asistenciaService.js';

// Sábado 22-ago: empleado con checada real 08:00-13:00 (recupera 5h).
const emp = await prisma.empleados.findFirst({
  where: { estatus: { is: { Nombre_Estatus: 'ACTIVO' } } },
  select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true }
});
const fecha = new Date('2026-08-22T00:00:00Z');
await prisma.empleados_Asistencia.deleteMany({ where: { ID_Empleado: emp.ID_Empleado, Fecha: fecha } });
await prisma.empleados_Asistencia.create({
  data: {
    ID_Empleado: emp.ID_Empleado, Fecha: fecha, Presente: true,
    Hora_Entrada: new Date('2026-08-22T08:00:00'), Hora_Salida: new Date('2026-08-22T13:00:00'),
    Horas_Trabajadas: 5
  }
});

const d = await obtenerHorasSemanalTodos(new Date('2026-08-17T00:00:00Z'), new Date('2026-08-23T00:00:00Z'), {});
const fila = d.filas.find(f => f.ID_Empleado === emp.ID_Empleado);
const iSab = d.fechas.findIndex(f => new Date(f).getDay() === 6);
const c = fila.celdas[iSab];
console.log('Empleado:', fila.nombre);
console.log('Celda sabado -> presente:', c.presente, '| horas:', c.horas, '| vacio:', c.vacio, '| esDomingo(descanso):', c.esDomingo);
console.log('Total semana:', fila.horas, '| esperadas:', fila.esperadas, '| extras:', fila.extras);

// Otro empleado, sabado sin checada
const otra = d.filas.find(f => f.ID_Empleado !== emp.ID_Empleado);
console.log('Sin checada ->', otra.nombre, 'vacio:', otra.celdas[iSab].vacio, '| horas:', otra.celdas[iSab].horas ?? 0);

await prisma.empleados_Asistencia.deleteMany({ where: { ID_Empleado: emp.ID_Empleado, Fecha: fecha } });
console.log('\n(prueba revertida)');
process.exit(0);
