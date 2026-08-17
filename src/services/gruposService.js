import prisma from '../config/database.js';

// ============================================================
// GRUPOS DE TRABAJO (encargado responsable + equipo con vigencia)
// Fuente de verdad de "quién puede un encargado asignar" — reemplaza al
// antiguo Encargado_Subordinados (sin fechas, un solo equipo por encargado).
// ============================================================

/**
 * Grupos activos de los que un empleado es encargado.
 * @param {number} idEmpleadoEncargado
 */
export async function obtenerGruposDeEncargado(idEmpleadoEncargado) {
  return prisma.grupos.findMany({
    where: { Activo: true, encargado: { ID_Empleado: idEmpleadoEncargado } },
    include: {
      _count: { select: { miembros: true } }
    },
    orderBy: { Nombre_Grupo: 'asc' }
  });
}

/**
 * Equipo vigente de un encargado en una fecha: unión deduplicada de miembros
 * activos y vigentes (Fecha_Inicio <= fecha <= Fecha_Fin ?? infinito) de TODOS
 * sus grupos activos.
 * @param {number} idEmpleadoEncargado
 * @param {Date} [fecha]
 * @returns {Promise<Array<{ID_Empleado:number, Nombre:string, Apellido_Paterno:string, Apellido_Materno:string|null}>>}
 */
export async function obtenerEquipoVigente(idEmpleadoEncargado, fecha = new Date()) {
  const dia = new Date(fecha);
  dia.setHours(0, 0, 0, 0);

  const miembros = await prisma.grupo_Miembros.findMany({
    where: {
      Activo: true,
      Fecha_Inicio: { lte: dia },
      OR: [{ Fecha_Fin: null }, { Fecha_Fin: { gte: dia } }],
      grupo: { Activo: true, encargado: { ID_Empleado: idEmpleadoEncargado } }
    },
    select: {
      empleado: {
        select: {
          ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true,
          area: { select: { Nombre_Area: true } },
          puesto: { select: { Nombre_Puesto: true } }
        }
      }
    }
  });

  const porId = new Map();
  for (const m of miembros) porId.set(m.empleado.ID_Empleado, m.empleado);
  return [...porId.values()];
}

/**
 * ¿El empleado pertenece al equipo vigente del encargado en esa fecha?
 * @param {number} idEmpleado
 * @param {number} idEmpleadoEncargado
 * @param {Date} fecha
 */
export async function empleadoEnEquipoDeEncargado(idEmpleado, idEmpleadoEncargado, fecha) {
  const dia = new Date(fecha);
  dia.setHours(0, 0, 0, 0);

  const miembro = await prisma.grupo_Miembros.findFirst({
    where: {
      ID_Empleado: idEmpleado,
      Activo: true,
      Fecha_Inicio: { lte: dia },
      OR: [{ Fecha_Fin: null }, { Fecha_Fin: { gte: dia } }],
      grupo: { Activo: true, encargado: { ID_Empleado: idEmpleadoEncargado } }
    },
    select: { ID_Miembro: true }
  });
  return !!miembro;
}

/**
 * Empleados activos disponibles para agregar a un grupo (excluye a quien ya
 * tenga una membresía ACTIVA y vigente en ese grupo; permite re-agregar si su
 * membresía anterior ya venció).
 * @param {number} idGrupo
 */
export async function obtenerEmpleadosDisponiblesParaGrupo(idGrupo) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const [empleados, miembrosVigentes] = await Promise.all([
    prisma.empleados.findMany({
      where: { ID_Estatus: 1 },
      orderBy: { Nombre: 'asc' },
      select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true }
    }),
    prisma.grupo_Miembros.findMany({
      where: {
        ID_Grupo: idGrupo,
        Activo: true,
        OR: [{ Fecha_Fin: null }, { Fecha_Fin: { gte: hoy } }]
      },
      select: { ID_Empleado: true }
    })
  ]);

  const vigentesIds = new Set(miembrosVigentes.map(m => m.ID_Empleado));
  return empleados.filter(e => !vigentesIds.has(e.ID_Empleado));
}

export default {
  obtenerGruposDeEncargado,
  obtenerEquipoVigente,
  empleadoEnEquipoDeEncargado,
  obtenerEmpleadosDisponiblesParaGrupo
};
