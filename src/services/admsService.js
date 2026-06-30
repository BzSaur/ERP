/**
 * Servicio ADMS - Push directo de checadores CLK-980 (protocolo ZK PUSH)
 *
 * Recibe checadas en vivo vía /iclock/* y las persiste en Empleados_Asistencia +
 * Historial_Checadas, consolidando jornadas multi-planta (entrada en planta A,
 * salida en planta B = una sola jornada con trazabilidad).
 *
 * Reutiliza la lógica de cálculo de horas del pipeline XLSX existente
 * (checadorImportService.js): redondearEntrada, calcularHorasDia, minutosAHora.
 * NO duplica reglas de negocio (comida 14-15, extras >18:00).
 *
 * Idempotencia (Opción A — try/catch P2002):
 *   Cada checada tiene Hash_Checada = sha256(SN \t PIN \t timestamp_crudo).
 *   El timestamp es la cadena TAL COMO LLEGÓ del device (sin parsear/normalizar TZ)
 *   para que el hash sea determinista independiente del TZ del servidor.
 *   Se hace `create` directo; si lanza P2002 sobre Hash_Checada => duplicado conocido
 *   => se ignora silenciosamente. Más performante que un pre-check findUnique
 *   (1 query vs 2; la mayoría de checadas NO son duplicadas).
 */

import crypto from 'crypto';
import prisma from '../config/database.js';
import config from '../config/env.js';
import { horaLocalDevice } from '../utils/tiempo.js';
import { calcularHorasPorPares, minutosAHora, dedupChecadas, esAreaCoberturaEspecial, reglaToleranciaPorFecha } from './checadorImportService.js';

// ============================================================
// PARSEO DE ATTLOG
// ============================================================

/**
 * Parsea el body de un POST /iclock/cdata?table=ATTLOG.
 * Formato ZK: una checada por línea, campos separados por TAB:
 *   PIN \t YYYY-MM-DD HH:mm:ss \t status \t verify \t workcode \t ...
 *
 * @param {string} body - texto crudo del device
 * @returns {Array<{pin, timestampRaw, status, verify}>}
 */
export function parsearAttlog(body) {
  if (!body || typeof body !== 'string') return [];

  const lineas = body.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const checadas = [];

  for (const linea of lineas) {
    const campos = linea.split('\t');
    if (campos.length < 2) continue;

    const pin = String(campos[0]).trim();
    const timestampRaw = String(campos[1]).trim();
    if (!pin || !timestampRaw) continue;

    checadas.push({
      pin,
      timestampRaw,                                   // string crudo para el hash
      status: campos[2] !== undefined ? parseInt(campos[2], 10) : null,
      verify: campos[3] !== undefined ? parseInt(campos[3], 10) : null
    });
  }

  return checadas;
}

/**
 * Hash determinista de una checada para idempotencia.
 * Usa el timestamp CRUDO (sin parsear) por diseño.
 */
export function hashChecada(sn, pin, timestampRaw) {
  return crypto
    .createHash('sha256')
    .update(`${sn}\t${pin}\t${timestampRaw}`)
    .digest('hex');
}

/**
 * Convierte el timestamp crudo del device a Date local.
 * El device envía "YYYY-MM-DD HH:mm:ss" en su TZ configurada (asumida = TZ del server).
 */
function parsearTimestamp(timestampRaw) {
  // "2026-06-06 08:03:00" -> Date local
  const m = timestampRaw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) {
    const d = new Date(timestampRaw);
    return isNaN(d.getTime()) ? null : d;
  }
  const [, y, mo, d, h, mi, s] = m;
  return new Date(
    Number(y), Number(mo) - 1, Number(d),
    Number(h), Number(mi), Number(s || '0'), 0
  );
}

// ============================================================
// PROCESAMIENTO DE UN BATCH DE CHECADAS DE UN CHECADOR
// ============================================================

/**
 * Procesa todas las checadas de un POST ATTLOG para un checador dado.
 *
 * @param {object} checador - registro de Checadores (incluye planta)
 * @param {string} body - texto crudo ATTLOG
 * @returns {{recibidas, procesadas, duplicadas, huerfanas, errores}}
 */
export async function procesarAttlog(checador, body) {
  const checadas = parsearAttlog(body);
  const resumen = { recibidas: checadas.length, procesadas: 0, duplicadas: 0, huerfanas: 0, errores: [] };

  // Cache PIN -> empleado para no consultar la BD por cada línea
  const empleadoCache = new Map();

  for (const ch of checadas) {
    try {
      const r = await procesarChecadaIndividual(checador, ch, empleadoCache);
      if (r === 'duplicada') resumen.duplicadas++;
      else if (r === 'huerfana') resumen.huerfanas++;
      else resumen.procesadas++;
    } catch (err) {
      resumen.errores.push({ pin: ch.pin, ts: ch.timestampRaw, error: err.message });
    }
  }

  return resumen;
}

export async function simularChecada({ idEmpleado, timestampRaw, idChecador, verify = null }) {
  const checador = await prisma.checadores.findUnique({
    where: { ID_Checador: Number(idChecador) },
    include: { planta: { select: { ID_Planta: true, Nombre: true } } }
  });
  if (!checador) throw new Error(`Checador ${idChecador} no existe`);

  const ch = { pin: String(idEmpleado), timestampRaw, status: null, verify };
  return procesarChecadaIndividual(checador, ch, new Map(), { skipDrift: true });
}

/**
 * Procesa una checada individual: idempotencia, drift temporal, dedup,
 * huérfano, empleado de baja, y consolidación normal.
 */
async function procesarChecadaIndividual(checador, ch, empleadoCache, opts = {}) {
  const hash = hashChecada(checador.Serial_Number, ch.pin, ch.timestampRaw);
  const fechaHora = parsearTimestamp(ch.timestampRaw);

  if (!fechaHora) {
    throw new Error(`Timestamp inválido: "${ch.timestampRaw}"`);
  }

  // 2. Validación temporal (drift) — encolar SET_TIME si excede umbral (1 solo pendiente).
  //    Se omite en simulación QA: el device simulado no tiene reloj que sincronizar y un
  //    timestamp de prueba (p.ej. retroactivo) NO debe encolar SET_TIME al hardware real.
  if (!opts.skipDrift) {
    await verificarDrift(checador, fechaHora);
  }

  // 3. Dedup corto configurable (default OFF). Idempotencia por hash ya cubre rebote exacto.
  if (config.adms.dedupWindowSec > 0) {
    const desde = new Date(fechaHora.getTime() - config.adms.dedupWindowSec * 1000);
    const hasta = new Date(fechaHora.getTime() + config.adms.dedupWindowSec * 1000);
    const cercana = await prisma.historial_Checadas.findFirst({
      where: {
        ID_Checador: checador.ID_Checador,
        Fecha_Hora: { gte: desde, lte: hasta }
        // mismo empleado se valida abajo; aquí se acota por checador+ventana
      },
      select: { ID_Checada: true, asistencia: { select: { ID_Empleado: true } } }
    });
    // (la confirmación de mismo empleado ocurre tras resolver el PIN)
    if (cercana) {
      const emp = await resolverEmpleado(ch.pin, empleadoCache);
      if (emp && cercana.asistencia?.ID_Empleado === emp.ID_Empleado) {
        return 'duplicada';
      }
    }
  }

  // Resolver empleado por PIN (= ID_Empleado en Vita, ver export-steren.js)
  const empleado = await resolverEmpleado(ch.pin, empleadoCache);

  // 4. PIN huérfano
  if (!empleado) {
    await prisma.checadas_Huerfanas.create({
      data: {
        PIN_Reportado: ch.pin,
        ID_Checador: checador.ID_Checador,
        Fecha_Hora: fechaHora,
        Tipo_Verificacion: ch.verify ?? null
      }
    });
    return 'huerfana';
  }

  // 5. Empleado dado de baja: registrar en historial (auditoría) pero NO tocar asistencia.
  //    Se inserta una checada "suelta" en un registro de asistencia para no perder trazabilidad.
  const dadoDeBaja = empleado.ID_Estatus !== 1;

  // 6. Persistencia (transacción): upsert asistencia + insert historial idempotente
  const fechaDia = new Date(fechaHora);
  fechaDia.setHours(0, 0, 0, 0);

  try {
    await prisma.$transaction(async (tx) => {
      // Asegurar registro de asistencia del día (para FK de Historial_Checadas)
      const asistencia = await tx.empleados_Asistencia.upsert({
        where: { ID_Empleado_Fecha: { ID_Empleado: empleado.ID_Empleado, Fecha: fechaDia } },
        update: {},
        create: {
          ID_Empleado: empleado.ID_Empleado,
          Fecha: fechaDia,
          Presente: true,
          CreatedBy: 'ADMS_PUSH'
        }
      });

      // Insert idempotente en historial (Opción A: create + catch P2002)
      await tx.historial_Checadas.create({
        data: {
          ID_Asistencia: asistencia.ID_Asistencia,
          Tipo_Checada: 'REGISTRO',
          Fecha_Hora: fechaHora,
          Ubicacion: checador.Ubicacion_Codigo || checador.planta?.Nombre || 'ADMS',
          Dispositivo: checador.Nombre,
          IP_Dispositivo: checador.Ultima_IP_Origen || null,
          Estado: 'REGISTRADO',
          ID_Checador: checador.ID_Checador,
          Tipo_Verificacion: ch.verify ?? null,
          Origen_Sincronizacion: 'ADMS_PUSH',
          Hash_Checada: hash
        }
      });

      // Empleado activo: recalcular consolidación de la jornada
      if (!dadoDeBaja) {
        await recalcularJornada(tx, asistencia.ID_Asistencia, empleado.ID_Empleado, fechaDia, empleado);
      }
    });
  } catch (err) {
    // Idempotencia: duplicado conocido por hash -> ignorar silenciosamente
    if (err.code === 'P2002' && (err.meta?.target?.includes?.('Hash_Checada') || String(err.meta?.target).includes('Hash_Checada'))) {
      return 'duplicada';
    }
    throw err;
  }

  return 'procesada';
}

/**
 * Resuelve PIN -> empleado (con estatus). PIN = ID_Empleado en Vita.
 */
async function resolverEmpleado(pin, cache) {
  if (cache.has(pin)) return cache.get(pin);

  const idEmpleado = parseInt(pin, 10);
  let empleado = null;
  if (!isNaN(idEmpleado)) {
    empleado = await prisma.empleados.findUnique({
      where: { ID_Empleado: idEmpleado },
      select: { ID_Empleado: true, ID_Estatus: true }
    });
  }
  cache.set(pin, empleado);
  return empleado;
}

// ============================================================
// CONSOLIDACIÓN MULTI-PLANTA DE LA JORNADA
// ============================================================

/**
 * Recalcula Empleados_Asistencia para un día a partir de TODAS las checadas
 * de Historial_Checadas de ese día (de cualquier planta).
 * - entrada = primera checada, salida = última
 * - Multi_Planta = entrada y salida en plantas distintas
 * - horas con la lógica existente (calcularHorasDia)
 */
async function recalcularJornada(tx, idAsistencia, idEmpleado, fechaDia, empleado) {
  const finDia = new Date(fechaDia);
  finDia.setHours(23, 59, 59, 999);

  const checadas = await tx.historial_Checadas.findMany({
    where: {
      asistencia: { ID_Empleado: idEmpleado, Fecha: fechaDia },
      Fecha_Hora: { gte: fechaDia, lte: finDia }
    },
    orderBy: { Fecha_Hora: 'asc' },
    include: { checador: { select: { ID_Checador: true, ID_Planta: true, Ubicacion_Codigo: true, planta: { select: { Nombre: true } } } } }
  });

  if (checadas.length === 0) return;

  const { toleranciaMin, aplicaCobertura } = reglaToleranciaPorFecha(fechaDia);
  let coberturaEspecial = false;
  if (aplicaCobertura) {
    const empInfo = await tx.empleados.findUnique({
      where: { ID_Empleado: idEmpleado },
      select: { area: { select: { Nombre_Area: true } }, puesto: { select: { Nombre_Puesto: true } } }
    });
    coberturaEspecial = esAreaCoberturaEspecial({ area: empInfo?.area?.Nombre_Area, puesto: empInfo?.puesto?.Nombre_Puesto });
  }

  // Colapsar dobles checadas (<1h, conserva la primera) ANTES de elegir
  // entrada/salida y calcular horas. Evita que un doble marcaje (ej. 07:35 y
  // 07:36) quede como entrada+salida de 1 min.
  const enriquecidas = checadas.map(c => ({
    totalMinutos: c.Fecha_Hora.getHours() * 60 + c.Fecha_Hora.getMinutes(),
    c
  }));
  const conservadas = dedupChecadas(enriquecidas, 60).map(x => x.c);

  const primera = conservadas[0];
  const ultima = conservadas[conservadas.length - 1];

  // Construir input para calcularHorasPorPares (espera {hora, minuto, totalMinutos, horaStr})
  const checadasCalc = conservadas.map(c => {
    const h = c.Fecha_Hora.getHours();
    const m = c.Fecha_Hora.getMinutes();
    return { hora: h, minuto: m, totalMinutos: h * 60 + m, horaStr: minutosAHora(h * 60 + m) };
  });

  const esSabado = fechaDia.getDay() === 6;
  // Suma de pares E/S: soporta salidas intermedias (clases) sin pagar el hueco.
  // ventanaDedupMin 0 porque ya deduplicamos arriba.
  const calc = calcularHorasPorPares(checadasCalc, { esSabado, ventanaDedupMin: 0, coberturaEspecial, toleranciaMin });

  // Ubicaciones (String legacy) y plantas
  const ubicEntrada = primera.checador?.Ubicacion_Codigo || primera.checador?.planta?.Nombre || primera.Ubicacion;
  const ubicSalida  = ultima.checador?.Ubicacion_Codigo  || ultima.checador?.planta?.Nombre  || ultima.Ubicacion;
  const plantaEntrada = primera.checador?.ID_Planta ?? null;
  const plantaSalida  = ultima.checador?.ID_Planta ?? null;
  const multiPlanta = plantaEntrada !== null && plantaSalida !== null && plantaEntrada !== plantaSalida;

  const horaEntrada = conservadas.length >= 1 ? primera.Fecha_Hora : null;
  const horaSalida  = conservadas.length >= 2 ? ultima.Fecha_Hora : null;

  await tx.empleados_Asistencia.update({
    where: { ID_Asistencia: idAsistencia },
    data: {
      Hora_Entrada: horaEntrada,
      Hora_Salida: horaSalida,
      Horas_Trabajadas: calc.horasTrabajadas || 0,
      Horas_Extras: calc.horasExtras || 0,
      Minutos_Retardo: calc.minutosRetardo || 0,
      Retardo: calc.retardo || false,
      Presente: true,
      Ubicacion_Entrada: ubicEntrada || null,
      Ubicacion_Salida: ubicSalida || null,
      ID_Checador_Entrada: primera.ID_Checador ?? null,
      ID_Checador_Salida: ultima.ID_Checador ?? null,
      Multi_Planta: multiPlanta,
      Notas: calc.notas || null,
      UpdatedAt: new Date()
    }
  });

  // Marcar tipos de checada y el Estado de la ENTRADA en historial, para coherencia con
  // las vistas (que muestran Historial_Checadas.Estado). El retardo sale de calc (misma
  // fuente que la jornada).
  const estadoEntrada = calc.retardo ? 'RETARDO' : 'A_TIEMPO';
  await tx.historial_Checadas.update({
    where: { ID_Checada: primera.ID_Checada },
    data: { Tipo_Checada: 'ENTRADA', Estado: estadoEntrada }
  });
  if (conservadas.length >= 2) {
    await tx.historial_Checadas.update({ where: { ID_Checada: ultima.ID_Checada }, data: { Tipo_Checada: 'SALIDA' } });
  }
}

// ============================================================
// DRIFT DE TIEMPO + COLA SET_TIME
// ============================================================

async function verificarDrift(checador, fechaHoraDevice) {
  // El device manda su hora LOCAL (TZ del device = America/Mexico_City).
  // parsearTimestamp la construye con el constructor local del proceso; con el
  // proceso en TZ Mexico (ver docker-compose TZ), fechaHoraDevice.getTime() ya
  // es el instante UTC real. Comparar directo contra Date.now().
  const driftMin = Math.round((Date.now() - fechaHoraDevice.getTime()) / 60000);
  if (Math.abs(driftMin) <= config.adms.timeDriftMaxMin) return;

  // Actualizar offset detectado
  await prisma.checadores.update({
    where: { ID_Checador: checador.ID_Checador },
    data: { Offset_Tiempo_Min: driftMin }
  });

  // Encolar SET_TIME sólo si no hay uno pendiente/enviado (evita loop)
  const yaPendiente = await prisma.checadores_Comandos.findFirst({
    where: {
      ID_Checador: checador.ID_Checador,
      Tipo_Comando: 'SET_TIME',
      Estatus: { in: ['pendiente', 'enviado'] }
    },
    select: { ID_Comando: true }
  });
  if (yaPendiente) return;

  const { fecha, hora } = horaLocalDevice();
  await prisma.checadores_Comandos.create({
    data: {
      ID_Checador: checador.ID_Checador,
      Tipo_Comando: 'SET_TIME',
      Comando: `SET OPTIONS DateTime=${fecha} ${hora}`
    }
  });
}

// ============================================================
// COLA DE COMANDOS (servidos vía /iclock/getrequest)
// ============================================================

/**
 * Construye la respuesta de getrequest: hasta `limite` comandos para el device
 * (orden FIFO), marcándolos 'enviado'. Devuelve string ZK: C:<ID>:<Comando>\n
 *
 * Incluye comandos 'pendiente' Y comandos 'enviado' que el device nunca confirmó
 * (>2 min sin devicecmd) hasta maxIntentos — algunos firmwares procesan solo
 * parte del lote y no reintentan solos, dejando comandos zombi en 'enviado'.
 */
export async function obtenerComandosPendientes(checador, limite = 20) {
  const maxIntentos = 5;
  const reintentarAntesDe = new Date(Date.now() - 2 * 60 * 1000); // 2 min

  const comandos = await prisma.checadores_Comandos.findMany({
    where: {
      ID_Checador: checador.ID_Checador,
      OR: [
        { Estatus: 'pendiente' },
        { Estatus: 'enviado', Intentos: { lt: maxIntentos }, Fecha_Enviado: { lt: reintentarAntesDe } }
      ]
    },
    orderBy: { Fecha_Creacion: 'asc' },
    take: limite
  });

  if (comandos.length === 0) return '';

  const ids = comandos.map(c => c.ID_Comando);
  await prisma.checadores_Comandos.updateMany({
    where: { ID_Comando: { in: ids } },
    data: { Estatus: 'enviado', Fecha_Enviado: new Date(), Intentos: { increment: 1 } }
  });

  return comandos.map(c => `C:${c.ID_Comando}:${c.Comando}`).join('\n');
}

/**
 * Procesa la confirmación de un comando (POST /iclock/devicecmd).
 * Body ZK típico: "ID=<n>&Return=<code>&CMD=<cmd>"
 */
export async function confirmarComando(body) {
  const params = {};
  String(body || '').split('&').forEach(kv => {
    const [k, v] = kv.split('=');
    if (k) params[k.trim()] = (v ?? '').trim();
  });

  const idComando = parseInt(params.ID, 10);
  if (isNaN(idComando)) return { ok: false, motivo: 'sin ID' };

  const returnCode = parseInt(params.Return, 10);
  const exito = !isNaN(returnCode) && returnCode >= 0;

  const comando = await prisma.checadores_Comandos.update({
    where: { ID_Comando: idComando },
    data: {
      Estatus: exito ? 'confirmado' : 'fallido',
      Respuesta: body ? String(body).slice(0, 1000) : null,
      Intentos: { increment: 1 }
    }
  }).catch(() => null); // comando inexistente: ignorar

  // SET_TIME confirmado => el device aplicó la hora; offset vuelve a 0.
  if (comando && exito && comando.Tipo_Comando === 'SET_TIME') {
    await prisma.checadores.update({
      where: { ID_Checador: comando.ID_Checador },
      data: { Offset_Tiempo_Min: 0 }
    }).catch(() => {});
  }

  return { ok: exito, idComando };
}

export default {
  parsearAttlog,
  hashChecada,
  procesarAttlog,
  simularChecada,
  obtenerComandosPendientes,
  confirmarComando
};
