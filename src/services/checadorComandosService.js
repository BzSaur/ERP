/**
 * Servicio de cola de comandos Vita -> Checadores.
 *
 * Encola comandos en Checadores_Comandos que los devices recogen vía
 * /iclock/getrequest (pull). NO abre conexión saliente desde Vita -> simplifica
 * firewall/NAS.
 *
 * Mapeo de usuario (igual que scripts/export-steren.js):
 *   PIN  = ID_Empleado
 *   Name = "Nombre Apellido_Paterno [Apellido_Materno]"
 *
 * Formato de comando ZK PUSH (DATA UPDATE/DELETE USERINFO), campos separados por TAB.
 *
 * Todas las funciones son best-effort: si fallan, NO deben romper el alta/baja de
 * empleado (se llaman con catch en el controller).
 */

import prisma from '../config/database.js';

function nombreCompleto(emp) {
  return [emp.Nombre, emp.Apellido_Paterno, emp.Apellido_Materno]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
}

/** Lista de checadores activos y aprobados (destinos de los comandos). */
async function checadoresDestino() {
  return prisma.checadores.findMany({
    where: { Activo: true, Estado_Registro: 'aprobado' },
    select: { ID_Checador: true }
  });
}

/**
 * Encola CREATE_USER (alta) o UPDATE_USER en todos los checadores activos.
 * @param {{ID_Empleado, Nombre, Apellido_Paterno, Apellido_Materno}} emp
 * @param {'CREATE_USER'|'UPDATE_USER'} tipo
 */
export async function encolarAltaEmpleado(emp, tipo = 'CREATE_USER') {
  const destinos = await checadoresDestino();
  if (destinos.length === 0) return 0;

  const pin = emp.ID_Empleado;
  const name = nombreCompleto(emp);
  const comando = `DATA UPDATE USERINFO PIN=${pin}\tName=${name}\tPri=0`;

  await prisma.checadores_Comandos.createMany({
    data: destinos.map(d => ({
      ID_Checador: d.ID_Checador,
      Tipo_Comando: tipo,
      ID_Empleado: pin,
      Comando: comando
    }))
  });
  return destinos.length;
}

/**
 * Sincroniza TODOS los empleados activos hacia un checador específico (o todos
 * los activos si no se pasa ID). Útil para poblar un device recién dado de alta
 * o para empleados que ya existían antes del módulo ADMS.
 *
 * Evita duplicar: no encola si ya hay un CREATE_USER pendiente/enviado para ese
 * empleado en ese checador.
 *
 * @param {number|null} idChecador - checador destino, o null = todos los activos
 * @returns {{encolados:number, checadores:number}}
 */
export async function sincronizarTodos(idChecador = null) {
  const destinos = idChecador
    ? await prisma.checadores.findMany({
        where: { ID_Checador: idChecador, Activo: true, Estado_Registro: 'aprobado' },
        select: { ID_Checador: true }
      })
    : await checadoresDestino();

  if (destinos.length === 0) return { encolados: 0, checadores: 0 };

  const empleados = await prisma.empleados.findMany({
    where: { ID_Estatus: 1 },
    select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true }
  });

  let encolados = 0;
  for (const d of destinos) {
    // PINs ya en cola (pendiente/enviado) para no duplicar
    const enCola = await prisma.checadores_Comandos.findMany({
      where: {
        ID_Checador: d.ID_Checador,
        Tipo_Comando: { in: ['CREATE_USER', 'UPDATE_USER'] },
        Estatus: { in: ['pendiente', 'enviado'] }
      },
      select: { ID_Empleado: true }
    });
    const yaEncolados = new Set(enCola.map(c => c.ID_Empleado));

    const nuevos = empleados.filter(e => !yaEncolados.has(e.ID_Empleado));
    if (nuevos.length === 0) continue;

    await prisma.checadores_Comandos.createMany({
      data: nuevos.map(e => ({
        ID_Checador: d.ID_Checador,
        Tipo_Comando: 'CREATE_USER',
        ID_Empleado: e.ID_Empleado,
        Comando: `DATA UPDATE USERINFO PIN=${e.ID_Empleado}\tName=${nombreCompleto(e)}\tPri=0`
      }))
    });
    encolados += nuevos.length;
  }

  return { encolados, checadores: destinos.length };
}

/** Encola DELETE_USER (baja) en todos los checadores activos. */
export async function encolarBajaEmpleado(idEmpleado) {
  const destinos = await checadoresDestino();
  if (destinos.length === 0) return 0;

  const comando = `DATA DELETE USERINFO PIN=${idEmpleado}`;

  await prisma.checadores_Comandos.createMany({
    data: destinos.map(d => ({
      ID_Checador: d.ID_Checador,
      Tipo_Comando: 'DELETE_USER',
      ID_Empleado: idEmpleado,
      Comando: comando
    }))
  });
  return destinos.length;
}

/**
 * Marca comandos fallidos (Intentos >= maxIntentos). Útil para un job de limpieza.
 */
export async function marcarFallidos(maxIntentos = 5) {
  const r = await prisma.checadores_Comandos.updateMany({
    where: { Estatus: 'enviado', Intentos: { gte: maxIntentos } },
    data: { Estatus: 'fallido' }
  });
  return r.count;
}

export default { encolarAltaEmpleado, encolarBajaEmpleado, sincronizarTodos, marcarFallidos };
