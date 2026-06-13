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
 * Sincronización DIFERENCIAL de empleados hacia un checador (o todos si no se
 * pasa ID). Reconcilia el estado del device contra la BD:
 *
 * - Empleado ACTIVO que no está (ni confirmado ni en cola) en el device
 *   -> CREATE_USER (alta nueva).
 * - Empleado dado de BAJA (inactivo) que SÍ está confirmado en el device y no
 *   tiene ya un DELETE en cola/confirmado -> DELETE_USER (sale del checador;
 *   su ID en BD NO se toca).
 * - Empleado activo ya presente en el device -> se SALTA (no re-encola).
 *
 * Idempotente: correrlo dos veces seguidas no genera comandos nuevos.
 *
 * @param {number|null} idChecador - checador destino, o null = todos los activos
 * @returns {{encolados:number, eliminados:number, checadores:number}}
 */
export async function sincronizarTodos(idChecador = null) {
  const destinos = idChecador
    ? await prisma.checadores.findMany({
        where: { ID_Checador: idChecador, Activo: true, Estado_Registro: 'aprobado' },
        select: { ID_Checador: true }
      })
    : await checadoresDestino();

  if (destinos.length === 0) return { encolados: 0, eliminados: 0, checadores: 0 };

  const activos = await prisma.empleados.findMany({
    where: { ID_Estatus: 1 },
    select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true }
  });
  const activosSet = new Set(activos.map(e => e.ID_Empleado));

  let encolados = 0;
  let eliminados = 0;

  for (const d of destinos) {
    // Todos los comandos de usuario de este device, para saber el estado de cada PIN
    const comandos = await prisma.checadores_Comandos.findMany({
      where: {
        ID_Checador: d.ID_Checador,
        Tipo_Comando: { in: ['CREATE_USER', 'UPDATE_USER', 'DELETE_USER'] }
      },
      select: { ID_Empleado: true, Tipo_Comando: true, Estatus: true }
    });

    // PIN presente en device = tiene CREATE/UPDATE confirmado o en cola,
    // y NO tiene un DELETE posterior confirmado/en cola.
    const enDevice = new Set();   // PINs que el device ya conoce (alta vigente)
    const conDeletePend = new Set(); // PINs con DELETE confirmado/en cola
    for (const c of comandos) {
      if (c.ID_Empleado == null) continue;
      const vigente = ['pendiente', 'enviado', 'confirmado'].includes(c.Estatus);
      if (!vigente) continue;
      if (c.Tipo_Comando === 'DELETE_USER') conDeletePend.add(c.ID_Empleado);
      else enDevice.add(c.ID_Empleado);
    }

    // ALTAS: activos que el device no conoce (o tienen un DELETE previo y vuelven)
    const aAltar = activos.filter(e =>
      !enDevice.has(e.ID_Empleado) || conDeletePend.has(e.ID_Empleado)
    );
    if (aAltar.length > 0) {
      await prisma.checadores_Comandos.createMany({
        data: aAltar.map(e => ({
          ID_Checador: d.ID_Checador,
          Tipo_Comando: 'CREATE_USER',
          ID_Empleado: e.ID_Empleado,
          Comando: `DATA UPDATE USERINFO PIN=${e.ID_Empleado}\tName=${nombreCompleto(e)}\tPri=0`
        }))
      });
      encolados += aAltar.length;
    }

    // BAJAS: PINs presentes en el device que ya NO son empleados activos
    // y aún no tienen un DELETE en cola/confirmado.
    const aBorrar = [...enDevice].filter(pin => !activosSet.has(pin) && !conDeletePend.has(pin));
    if (aBorrar.length > 0) {
      await prisma.checadores_Comandos.createMany({
        data: aBorrar.map(pin => ({
          ID_Checador: d.ID_Checador,
          Tipo_Comando: 'DELETE_USER',
          ID_Empleado: pin,
          Comando: `DATA DELETE USERINFO PIN=${pin}`
        }))
      });
      eliminados += aBorrar.length;
    }
  }

  return { encolados, eliminados, checadores: destinos.length };
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
