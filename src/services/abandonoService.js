/**
 * Detección de abandono de trabajo y bloqueo del checador.
 *
 * Criterio (definido por RH): 3 o más faltas CONSECUTIVAS. Es más estricto que
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

  const alertas = [];
  for (const fila of datos.filas) {
    // Días con falta real: laborable, sin checada, sin vacaciones/incidencia
    // ni actividad de campo. Los días de hoy en adelante no cuentan todavía.
    const diasFalta = [];
    fila.celdas.forEach((c, i) => {
      const f = datos.fechas[i];
      if (!c.vacio || !f || new Date(f) >= hoy) return;
      diasFalta.push(new Date(f));
    });
    if (diasFalta.length < FALTAS_CONSECUTIVAS) continue;
    diasFalta.sort((a, b) => a - b);

    // Racha más larga de días laborables seguidos (el domingo no la rompe).
    let mejorRacha = 1, racha = 1;
    let inicioRacha = diasFalta[0], mejorInicio = diasFalta[0], mejorFin = diasFalta[0];
    for (let i = 1; i < diasFalta.length; i++) {
      const esperado = new Date(diasFalta[i - 1]);
      do { esperado.setDate(esperado.getDate() + 1); } while (esperado.getDay() === 0);

      if (diasFalta[i].getTime() === esperado.getTime()) {
        racha++;
      } else {
        racha = 1;
        inicioRacha = diasFalta[i];
      }
      if (racha > mejorRacha) { mejorRacha = racha; mejorInicio = inicioRacha; mejorFin = diasFalta[i]; }
    }

    if (mejorRacha < FALTAS_CONSECUTIVAS) continue;

    alertas.push({
      ID_Empleado: fila.ID_Empleado,
      nombre: fila.nombre,
      area: fila.area,
      totalFaltas: diasFalta.length,
      consecutivas: mejorRacha,
      rachaDesde: mejorInicio.toISOString().slice(0, 10),
      rachaHasta: mejorFin.toISOString().slice(0, 10),
      ultimaFalta: diasFalta[diasFalta.length - 1].toISOString().slice(0, 10)
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

  const suspendido = await prisma.cat_Estatus_Empleado.findFirst({ where: { Nombre_Estatus: 'SUSPENDIDO' } });
  if (!suspendido) return [];

  // Solo los que hoy están ACTIVO: no tocar bajas, incapacidades ni vacaciones.
  const candidatos = await prisma.empleados.findMany({
    where: {
      ID_Empleado: { in: alertas.map(a => a.ID_Empleado) },
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
