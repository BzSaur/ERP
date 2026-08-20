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
import { logger } from '../config/logger.js';

function nombreCompleto(emp) {
  return [emp.Nombre, emp.Apellido_Paterno, emp.Apellido_Materno]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
}

/**
 * Comando que BLOQUEA a un usuario sin borrar su huella.
 *
 * `Verify=2` obliga a verificar por contraseña, y `Passwd=999999` fija una que
 * el empleado no conoce. La huella sigue enrolada pero deja de ser método
 * válido de entrada: el lector la rechaza y muestra que pide contraseña, así
 * que la persona SÍ se entera en el momento y va a RH.
 *
 * Se llegó a esto por descarte, probando contra el device real (20-ago-2026):
 *  - `Enable=0`: no es campo del USERINFO de ZK. El device lo ignora, confirma
 *    el comando y el usuario sigue checando (checada en vivo 34s después).
 *  - `Grp=0 TZ=0000000000000000`: tampoco bloquea, mismo resultado.
 *
 * No usar `DATA DELETE USERINFO` para esto: sí bloquea, pero borra la huella y
 * obliga a re-enrolar biométricos al reactivar. Eso queda solo para BAJA.
 */
function comandoBloqueo(pin, name) {
  return `DATA UPDATE USERINFO PIN=${pin}\tName=${name}\tPri=0\tPasswd=999999\tVerify=2`;
}

/**
 * Comando que REHABILITA: limpia la contraseña forzada y devuelve la
 * verificación por defecto (`Verify=0` = cualquier método enrolado, incluida
 * la huella que nunca se borró).
 */
function comandoAlta(pin, name) {
  return `DATA UPDATE USERINFO PIN=${pin}\tName=${name}\tPri=0\tPasswd=\tVerify=0`;
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
  const comando = comandoAlta(pin, name);

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

  // Antes de decidir quién va al device: aplicar el bloqueo por faltas
  // consecutivas. Va aquí y no en una pantalla para que surta efecto en cuanto
  // llegan las checadas nuevas — quien completó su racha sale del checador en
  // esta misma pasada. Import diferido: evita un ciclo con asistenciaService.
  // DESACTIVADO: el bloqueo automático suspendió a media plantilla en su
  // primer uso real (las faltas de días sin sincronizar se leyeron como
  // abandono). Queda solo como alerta en /incidencias, donde RH decide caso
  // por caso. Para reactivarlo hay que validar antes contra datos reales.
  let bloqueadosPorAbandono = [];

  // Tres grupos, porque el device se trata distinto en cada uno:
  //  - ACTIVOS (incl. VACACIONES/INCAPACIDAD): alta normal, pueden checar.
  //  - SUSPENDIDO: se DESHABILITA sin borrar. El PIN y la huella siguen en el
  //    device; solo se le niega el acceso. Así, al reactivar no hay que
  //    re-enrolar biométricos (DELETE sí los borraría y se perderían).
  //  - BAJA: se borra del device de verdad (ya no es empleado).
  const activos = await prisma.empleados.findMany({
    where: { estatus: { is: { Nombre_Estatus: { notIn: ['BAJA', 'SUSPENDIDO'] } } } },
    select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true }
  });
  const activosSet = new Set(activos.map(e => e.ID_Empleado));

  const suspendidos = await prisma.empleados.findMany({
    where: { estatus: { is: { Nombre_Estatus: 'SUSPENDIDO' } } },
    select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true }
  });
  const suspendidosSet = new Set(suspendidos.map(e => e.ID_Empleado));

  let encolados = 0;
  let eliminados = 0;
  let deshabilitados = 0;

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

    // Último comando de habilitación por PIN, para no re-encolar lo mismo.
    const ultimoEstado = new Map(); // PIN -> 'habilitado' | 'deshabilitado'
    for (const c of comandos) {
      if (c.ID_Empleado == null) continue;
      if (!['pendiente', 'enviado', 'confirmado'].includes(c.Estatus)) continue;
      if (c.Tipo_Comando === 'CREATE_USER') ultimoEstado.set(c.ID_Empleado, 'habilitado');
      else if (c.Tipo_Comando === 'UPDATE_USER') ultimoEstado.set(c.ID_Empleado, 'deshabilitado');
    }

    // ALTAS: activos que el device no conoce, que traen un DELETE previo, o
    // que venían deshabilitados y hay que volver a habilitar (reactivación).
    const aAltar = activos.filter(e =>
      !enDevice.has(e.ID_Empleado) ||
      conDeletePend.has(e.ID_Empleado) ||
      ultimoEstado.get(e.ID_Empleado) === 'deshabilitado'
    );
    if (aAltar.length > 0) {
      await prisma.checadores_Comandos.createMany({
        data: aAltar.map(e => ({
          ID_Checador: d.ID_Checador,
          Tipo_Comando: 'CREATE_USER',
          ID_Empleado: e.ID_Empleado,
          Comando: comandoAlta(e.ID_Empleado, nombreCompleto(e))
        }))
      });
      encolados += aAltar.length;
    }

    // BLOQUEOS: suspendidos que el device conoce y siguen habilitados. Se les
    // quita la franja horaria (el PIN y la huella permanecen en el device).
    const aDeshabilitar = suspendidos.filter(e =>
      enDevice.has(e.ID_Empleado) &&
      !conDeletePend.has(e.ID_Empleado) &&
      ultimoEstado.get(e.ID_Empleado) !== 'deshabilitado'
    );
    if (aDeshabilitar.length > 0) {
      await prisma.checadores_Comandos.createMany({
        data: aDeshabilitar.map(e => ({
          ID_Checador: d.ID_Checador,
          Tipo_Comando: 'UPDATE_USER',
          ID_Empleado: e.ID_Empleado,
          Comando: comandoBloqueo(e.ID_Empleado, nombreCompleto(e))
        }))
      });
      deshabilitados += aDeshabilitar.length;
    }

    // BAJAS REALES: PINs en el device que ya no son empleados vigentes ni
    // suspendidos. Aquí sí se borra (con su huella): ya no trabajan aquí.
    const aBorrar = [...enDevice].filter(pin =>
      !activosSet.has(pin) && !suspendidosSet.has(pin) && !conDeletePend.has(pin)
    );
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

  return { encolados, eliminados, deshabilitados, checadores: destinos.length, bloqueadosPorAbandono };
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
