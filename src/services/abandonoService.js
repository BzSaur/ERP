/**
 * Detección de abandono de trabajo y bloqueo del checador.
 *
 * Criterio (definido por RH): 3 o más faltas CONSECUTIVAS Y VIGENTES — la racha
 * tiene que llegar hasta el último día laborable cerrado. Quien faltó tres días
 * seguidos y ya volvió no alerta: el propósito es detectar a quien no viene
 * ahora, no auditar el historial del mes. Es más estricto que
 * la LFT (art. 47-X habla de más de 3 faltas en 30 días, no necesariamente
 * seguidas) y su propósito es operativo, no de rescisión: quien deja de venir
 * varios días seguidos pierde el acceso al checador y tiene que presentarse
 * con RH para que lo reactiven.
 *
 * El bloqueo cambia el estatus a SUSPENDIDO — NO es una baja: el empleado
 * conserva su relación laboral, nómina y antigüedad. checadorComandosService
 * retira del device a los SUSPENDIDO igual que a los BAJA.
 *
 * Se ejecuta desde la sincronización del checador (para que aplique en cuanto
 * llegan las checadas) y también al abrir la pantalla de incidencias.
 */

import prisma from '../config/database.js';
import { registrarCambio } from '../middleware/audit.js';
import * as asistenciaService from './asistenciaService.js';

// Faltas seguidas que disparan el bloqueo.
export const FALTAS_CONSECUTIVAS = 3;
// Ventana hacia atrás en la que se busca el patrón.
const DIAS_VENTANA = 30;

/**
 * Empleados con una racha de faltas que alcanza el umbral.
 * @param {number|null} idEmpleado  limita a un empleado (opcional)
 * @returns {Promise<Array>} alertas ordenadas por racha descendente
 */
export async function detectarAbandono(idEmpleado = null) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - DIAS_VENTANA);

  const datos = await asistenciaService.obtenerHorasSemanalTodos(
    desde, hoy,
    idEmpleado ? { idsPermitidos: [idEmpleado] } : null
  );

  // Fecha de ingreso y última checada de cada empleado del rango. Sin esto se
  // alerta a quien nunca pudo checar: los días anteriores a su alta salen
  // "vacíos" y se leen como faltas.
  const idsFilas = datos.filas.map(f => f.ID_Empleado);
  const [altas, ultimasChecadas] = await Promise.all([
    prisma.empleados.findMany({
      where: { ID_Empleado: { in: idsFilas } },
      select: { ID_Empleado: true, Fecha_Ingreso: true }
    }),
    prisma.empleados_Asistencia.groupBy({
      by: ['ID_Empleado'],
      where: { ID_Empleado: { in: idsFilas }, Presente: true },
      _max: { Fecha: true }
    })
  ]);
  const ingresoDe = new Map(altas.map(a => [a.ID_Empleado, a.Fecha_Ingreso]));
  const tieneHistorial = new Set(ultimasChecadas.filter(u => u._max.Fecha).map(u => u.ID_Empleado));

  // Quien ya checó HOY rompió la racha, aunque el día no haya cerrado. La
  // racha se mide hasta el último día laborable cerrado (ayer), así que sin
  // esto alguien que se presentó esta mañana seguiría saliendo como abandono.
  const ymdHoy = hoy.toISOString().slice(0, 10);
  const checoHoy = new Set(
    ultimasChecadas
      .filter(u => u._max.Fecha && new Date(u._max.Fecha).toISOString().slice(0, 10) >= ymdHoy)
      .map(u => u.ID_Empleado)
  );

  const alertas = [];
  for (const fila of datos.filas) {
    // Quien nunca ha checado no puede "abandonar": o no está enrolado en el
    // device, o su PIN no corresponde. Es un problema de padrón, no de RH.
    if (!tieneHistorial.has(fila.ID_Empleado)) continue;

    // Se presentó hoy: la racha ya no está vigente.
    if (checoHoy.has(fila.ID_Empleado)) continue;

    // Días con falta real: laborable, sin checada, sin vacaciones/incidencia
    // ni actividad de campo. Los días de hoy en adelante no cuentan todavía,
    // ni los anteriores al alta del empleado.
    const ingreso = ingresoDe.get(fila.ID_Empleado);
    const desdeAlta = ingreso ? new Date(ingreso) : null;
    if (desdeAlta) desdeAlta.setHours(0, 0, 0, 0);

    const diasFalta = [];
    fila.celdas.forEach((c, i) => {
      const f = datos.fechas[i];
      if (!c.vacio || !f || new Date(f) >= hoy) return;
      if (desdeAlta && new Date(f) < desdeAlta) return;
      diasFalta.push(new Date(f));
    });
    if (diasFalta.length < FALTAS_CONSECUTIVAS) continue;
    diasFalta.sort((a, b) => a - b);

    // Solo interesa la racha VIGENTE: la que llega hasta el último día
    // laborable cerrado. Una racha de hace tres semanas, ya rota porque la
    // persona volvió, no es abandono — RH necesita a quien no viene AHORA.
    const ultimoLaborable = new Date(hoy);
    do { ultimoLaborable.setDate(ultimoLaborable.getDate() - 1); }
    while (asistenciaService.esDiaDescanso(ultimoLaborable));

    const ultimaFalta = diasFalta[diasFalta.length - 1];
    if (ultimaFalta.getTime() !== ultimoLaborable.getTime()) continue;

    // Se cuenta hacia atrás desde el último día laborable, hasta que se rompe.
    let consecutivas = 1;
    let inicio = ultimaFalta;
    for (let i = diasFalta.length - 2; i >= 0; i--) {
      const esperado = new Date(diasFalta[i + 1]);
      do { esperado.setDate(esperado.getDate() - 1); } while (asistenciaService.esDiaDescanso(esperado));
      if (diasFalta[i].getTime() !== esperado.getTime()) break;
      consecutivas++;
      inicio = diasFalta[i];
    }

    if (consecutivas < FALTAS_CONSECUTIVAS) continue;

    alertas.push({
      ID_Empleado: fila.ID_Empleado,
      nombre: fila.nombre,
      area: fila.area,
      totalFaltas: diasFalta.length,
      consecutivas,
      rachaDesde: inicio.toISOString().slice(0, 10),
      rachaHasta: ultimaFalta.toISOString().slice(0, 10),
      ultimaFalta: ultimaFalta.toISOString().slice(0, 10)
    });
  }

  alertas.sort((a, b) => b.consecutivas - a.consecutivas || b.totalFaltas - a.totalFaltas);
  return alertas;
}

/**
 * Aplica el bloqueo: pasa a SUSPENDIDO a los alertados que hoy están ACTIVO,
 * para que la sincronización los retire del device.
 *
 * Guarda: si el checador no reportó NINGUNA checada en la ventana, las
 * "faltas" son un fallo de sincronización y no ausencias reales — no se
 * bloquea a nadie (si no, una caída del checador suspendería a la plantilla).
 *
 * @param {Array} alertas  salida de detectarAbandono()
 * @param {Object|null} usuario  quién queda registrado en la bitácora
 * @param {string|null} ip
 * @returns {Promise<Array>} bloqueados en esta corrida
 */
export async function bloquearPorAbandono(alertas, usuario = null, ip = null) {
  if (!alertas.length) return [];

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - DIAS_VENTANA);

  // El checador debe estar reportando de verdad. Dos condiciones:
  //  1) Que haya checadas recientes (últimos 7 días): si el device dejó de
  //     enviar, las "faltas" son un fallo de sincronización.
  //  2) Que los alertados no sean casi toda la plantilla: eso también apunta a
  //     un problema de datos, no a un abandono masivo.
  const hace7 = new Date(hoy);
  hace7.setDate(hace7.getDate() - 7);

  const [checadasRecientes, totalActivos] = await Promise.all([
    prisma.empleados_Asistencia.count({
      where: { Fecha: { gte: hace7, lte: hoy }, Presente: true }
    }),
    prisma.empleados.count({ where: { estatus: { is: { Nombre_Estatus: 'ACTIVO' } } } })
  ]);
  if (checadasRecientes === 0) return [];

  // Si más de la mitad de la plantilla activa "abandonó", no se bloquea nada.
  const alertadosActivos = alertas.length;
  if (totalActivos > 0 && alertadosActivos > totalActivos * 0.5) return [];

  // Quien trabaja en sábado no se bloquea automáticamente. El sábado no genera
  // falta (es opcional, para recuperar horas), así que alguien cuyo trabajo
  // real cae ahí acumula "faltas" de lunes a viernes sin haber faltado nunca.
  // Sigue apareciendo en la alerta de /incidencias para que RH lo revise; solo
  // se le exime del bloqueo sin intervención.
  const sabatinos = new Set();
  for (const a of alertas) {
    const enSabado = await prisma.empleados_Asistencia.findMany({
      where: { ID_Empleado: a.ID_Empleado, Presente: true, Fecha: { gte: desde, lte: hoy } },
      select: { Fecha: true }
    });
    // getUTCDay: Fecha es @db.Date (00:00Z); getDay() correría el día en CDMX.
    if (enSabado.some(x => new Date(x.Fecha).getUTCDay() === 6)) sabatinos.add(a.ID_Empleado);
  }
  const bloqueables = alertas.filter(a => !sabatinos.has(a.ID_Empleado));
  if (bloqueables.length === 0) return [];

  const suspendido = await prisma.cat_Estatus_Empleado.findFirst({ where: { Nombre_Estatus: 'SUSPENDIDO' } });
  if (!suspendido) return [];

  // Solo los que hoy están ACTIVO: no tocar bajas, incapacidades ni vacaciones.
  const candidatos = await prisma.empleados.findMany({
    where: {
      ID_Empleado: { in: bloqueables.map(a => a.ID_Empleado) },
      estatus: { is: { Nombre_Estatus: 'ACTIVO' } }
    },
    select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true }
  });
  if (candidatos.length === 0) return [];

  const porId = new Map(alertas.map(a => [a.ID_Empleado, a]));
  const bloqueados = [];

  for (const emp of candidatos) {
    const a = porId.get(emp.ID_Empleado);
    const motivo = `${a.consecutivas} faltas consecutivas (${a.rachaDesde} a ${a.rachaHasta})`;

    await prisma.empleados.update({
      where: { ID_Empleado: emp.ID_Empleado },
      data: { ID_Estatus: suspendido.ID_Estatus }
    });

    try {
      await registrarCambio({
        usuario,
        accion: 'UPDATE',
        tabla: 'Empleados',
        idRegistro: emp.ID_Empleado.toString(),
        descripcion: `Checador BLOQUEADO automáticamente: ${motivo}. Estatus ACTIVO → SUSPENDIDO; debe presentarse con RH para reactivarse.`,
        datosPrevios: { Estatus: 'ACTIVO' },
        datosNuevos: { Estatus: 'SUSPENDIDO', motivo },
        ip
      });
    } catch (err) {
      // La bitácora es best-effort: no debe impedir el bloqueo.
    }

    bloqueados.push({ ID_Empleado: emp.ID_Empleado, nombre: `${emp.Nombre} ${emp.Apellido_Paterno}`, motivo });
  }

  return bloqueados;
}

/**
 * Detecta y bloquea en un solo paso. Es lo que invoca la sincronización del
 * checador, para que el bloqueo aplique en cuanto llegan las checadas nuevas.
 */
export async function evaluarYBloquear(usuario = null, ip = null) {
  const alertas = await detectarAbandono();
  const bloqueados = await bloquearPorAbandono(alertas, usuario, ip);
  return { alertas, bloqueados };
}

export default { detectarAbandono, bloquearPorAbandono, evaluarYBloquear, FALTAS_CONSECUTIVAS };
