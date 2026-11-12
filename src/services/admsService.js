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
import { calcularHorasPorPares, minutosAHora, dedupChecadas, esAreaCoberturaEspecial, reglaToleranciaPorFecha, VENTANA_DEDUP_MIN, detectarCruceNocturno, salidaHuerfanaNocturna, CORTE_NOCTURNO_MIN } from './checadorImportService.js';

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
  //    Solo BAJA real cuenta — VACACIONES/INCAPACIDAD/SUSPENDIDO siguen consolidando jornada normal.
  const dadoDeBaja = empleado.estatus?.Nombre_Estatus === 'BAJA';

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
      select: { ID_Empleado: true, ID_Estatus: true, estatus: { select: { Nombre_Estatus: true } } }
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
// Checadas MANUALES (capturadas por RH/encargado) sustituyen a las del reloj:
// una ENTRADA manual reemplaza la primera del reloj, una SALIDA manual la última.
// Las intermedias del reloj se conservan. Si hay varias manuales del mismo tipo
// gana la más reciente (mayor ID_Checada).
function aplicarManuales(deviceDedup, manuales) {
  const ultimo = (tipo) => manuales
    .filter(c => c.Tipo_Checada === tipo)
    .sort((a, b) => b.ID_Checada - a.ID_Checada)[0];
  const mEnt = ultimo('ENTRADA');
  const mSal = ultimo('SALIDA');
  const mid = [...deviceDedup];
  if (mEnt && mid.length) mid.shift();
  if (mSal && mid.length && (mEnt || mid.length >= 2)) mid.pop();
  return [mEnt, ...mid, mSal]
    .filter(Boolean)
    .sort((a, b) => a.Fecha_Hora - b.Fecha_Hora);
}

// Checadas que cuentan en el día: dobles del reloj colapsadas (<20 min) y las
// manuales sustituyendo entrada/salida. Fuente única para recalcularJornada y
// para las vistas/Excel que recalculan horas con o sin redondeo.
export function consolidarChecadas(checadas) {
  const delReloj = checadas.filter(c => c.Origen_Sincronizacion !== 'MANUAL');
  const manuales = checadas.filter(c => c.Origen_Sincronizacion === 'MANUAL');
  const enriquecidas = delReloj.map(c => ({
    totalMinutos: c.Fecha_Hora.getHours() * 60 + c.Fecha_Hora.getMinutes(),
    c
  }));
  const dedup = dedupChecadas(enriquecidas, VENTANA_DEDUP_MIN);
  // Impar por dedup: la última conservada tenía un doble pegado (ej. 18:02+18:03
  // tras salir 16:05) = marcaje espurio, no entrada sin salida. Se descarta y el
  // día queda cerrado en el último par completo. Impar sin dobles (entra, sale,
  // regresa) sigue siendo par abierto.
  if (dedup.length >= 3 && dedup.length % 2 && dedup[dedup.length - 1] !== enriquecidas[enriquecidas.length - 1]) dedup.pop();
  const relojDedup = dedup.map(x => x.c);
  return manuales.length ? aplicarManuales(relojDedup, manuales) : relojDedup;
}

const ESTADOS_NOCTURNA_FIJOS = ['CONFIRMADA', 'MANUAL', 'RECHAZADA'];
const NOCTURNA_APLICADA = ['CONFIRMADA', 'MANUAL'];
const claveLocal = (f) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
const claveDB = (f) => new Date(f).toISOString().slice(0, 10); // @db.Date llega 00:00Z
const diaMas = (fecha, delta) => { const f = new Date(fecha); f.setDate(f.getDate() + delta); f.setHours(0, 0, 0, 0); return f; };

/**
 * Recalcula el día y sus vecinos. Una checada en D puede abrir o cerrar la
 * jornada nocturna D-1 -> D y D -> D+1, así que se recalculan D-1, D y D+1 en
 * orden: cada día lee lo que la víspera acaba de escribir. Si el cruce que sale
 * de un día ya no coincide con lo guardado en el siguiente (noches seguidas,
 * "fue olvido"), se sigue hacia adelante hasta que coincida (máx. una semana).
 */
export async function recalcularJornada(tx, idAsistencia, idEmpleado, fechaDia) {
  let cruza = false;
  for (const delta of [-1, 0, 1]) {
    cruza = await recalcularDia(tx, idEmpleado, diaMas(fechaDia, delta));
  }
  for (let delta = 2; delta <= 8; delta++) {
    const f = diaMas(fechaDia, delta);
    const sig = await tx.empleados_Asistencia.findUnique({
      where: { ID_Empleado_Fecha: { ID_Empleado: idEmpleado, Fecha: f } },
      select: { Nocturna_Entrante: true }
    });
    if (!sig || sig.Nocturna_Entrante === cruza) break;
    cruza = await recalcularDia(tx, idEmpleado, f);
  }
}

async function recalcularDia(tx, idEmpleado, fechaDia) {
  const fPrev = diaMas(fechaDia, -1);
  const fSig = diaMas(fechaDia, 1);
  const filas = await tx.empleados_Asistencia.findMany({
    where: { ID_Empleado: idEmpleado, Fecha: { gte: fPrev, lte: fSig } },
    select: { ID_Asistencia: true, Fecha: true, Nocturna_Estado: true, Nocturna_Entrante: true }
  });
  const fila = filas.find(r => claveDB(r.Fecha) === claveLocal(fechaDia));
  if (!fila) return false;

  const checadas = await tx.historial_Checadas.findMany({
    where: {
      ID_Asistencia: { in: filas.map(r => r.ID_Asistencia) },
      Fecha_Hora: { gte: fPrev, lt: diaMas(fechaDia, 2) }
    },
    orderBy: { Fecha_Hora: 'asc' },
    include: { checador: { select: { ID_Checador: true, ID_Planta: true, Ubicacion_Codigo: true, planta: { select: { Nombre: true } } } } }
  });
  // Checadas de un día = las de su fila cuya hora cae en ese día calendario.
  const delDia = (f) => {
    const r = filas.find(x => claveDB(x.Fecha) === claveLocal(f));
    return {
      fila: r || null,
      cs: r ? consolidarChecadas(checadas.filter(c => c.ID_Asistencia === r.ID_Asistencia && claveLocal(c.Fecha_Hora) === claveLocal(f))) : []
    };
  };
  const prev = delDia(fPrev);
  const act = delDia(fechaDia);
  const sig = delDia(fSig);
  if (act.cs.length === 0) return false;

  // Jornada nocturna: pIn = salida (primera checada de hoy) del par que abrió la
  // víspera; pOut = salida de mañana que cierra el último par abierto de hoy.
  const propiasPrev = prev.fila?.Nocturna_Entrante ? prev.cs.slice(1) : prev.cs;
  const pIn = detectarCruceNocturno(propiasPrev, act.cs, prev.fila?.Nocturna_Estado ?? null);
  // Sin entrada la víspera pero el día abre con salida de madrugada (noche sin entrada sellada).
  const huerfana = pIn ? null : salidaHuerfanaNocturna(act.cs, sig.cs, fila.Nocturna_Estado);
  const propias = (pIn || huerfana) ? act.cs.slice(1) : act.cs;
  const pOut = detectarCruceNocturno(propias, sig.cs, fila.Nocturna_Estado);
  // Detectada sola (AUTO) = pendiente: se marca y su salida no se empareja con
  // nada, pero NO suma horas hasta que RH diga "Sí" (CONFIRMADA) o la marque a mano.
  const aplicaIn = !!pIn && NOCTURNA_APLICADA.includes(prev.fila?.Nocturna_Estado);
  const aplicaOut = !!pOut && NOCTURNA_APLICADA.includes(fila.Nocturna_Estado);
  const ePrev = aplicaIn ? propiasPrev[propiasPrev.length - 1] : null;
  const minutosDe = (c) => c.Fecha_Hora.getHours() * 60 + c.Fecha_Hora.getMinutes();

  const { toleranciaMin, aplicaCobertura, restrictivo } = reglaToleranciaPorFecha(fechaDia);
  let coberturaEspecial = false;
  if (aplicaCobertura) {
    const empInfo = await tx.empleados.findUnique({
      where: { ID_Empleado: idEmpleado },
      select: { area: { select: { Nombre_Area: true } }, puesto: { select: { Nombre_Puesto: true } } }
    });
    coberturaEspecial = esAreaCoberturaEspecial({ area: empInfo?.area?.Nombre_Area, puesto: empInfo?.puesto?.Nombre_Puesto });
  }

  // Dobles checadas (<20 min) y manuales ya resueltas en consolidarChecadas.
  const conservadas = aplicaIn ? [pIn, ...propias] : propias;
  if (conservadas.length === 0) {
    // Solo trae la salida de una nocturna aún por confirmar: el día no suma nada.
    await tx.empleados_Asistencia.update({
      where: { ID_Asistencia: fila.ID_Asistencia },
      data: {
        Hora_Entrada: null, Hora_Salida: pIn.Fecha_Hora, Horas_Trabajadas: 0, Horas_Extras: 0,
        Minutos_Retardo: 0, Retardo: false, Presente: true, Multi_Planta: false,
        Ubicacion_Entrada: null, Ubicacion_Salida: null, ID_Checador_Entrada: null, ID_Checador_Salida: null,
        Notas: 'Salida de jornada nocturna por confirmar',
        Nocturna_Estado: fila.Nocturna_Estado === 'RECHAZADA' ? 'RECHAZADA' : null,
        Nocturna_Entrante: true,
        UpdatedAt: new Date()
      }
    });
    await tx.historial_Checadas.update({ where: { ID_Checada: pIn.ID_Checada }, data: { Tipo_Checada: 'SALIDA' } });
    return false;
  }

  // Construir input para calcularHorasPorPares (espera {hora, minuto, totalMinutos, horaStr})
  const checadasCalc = conservadas.map(c => {
    const t = minutosDe(c);
    return { hora: Math.floor(t / 60), minuto: t % 60, totalMinutos: t, horaStr: minutosAHora(t) };
  });

  const esSabado = fechaDia.getDay() === 6;
  // Suma de pares E/S: soporta salidas intermedias (clases) sin pagar el hueco.
  // ventanaDedupMin 0 porque ya deduplicamos arriba.
  const calc = calcularHorasPorPares(checadasCalc, {
    esSabado, ventanaDedupMin: 0, coberturaEspecial, toleranciaMin, restrictivo,
    // Entró la víspera: el tramo cuenta desde las 22:00 (o su entrada si fue más tarde).
    entradaNocturnaMin: ePrev ? Math.max(minutosDe(ePrev), CORTE_NOCTURNO_MIN) - 1440 : null,
    salidaNocturna: aplicaOut
  });

  const primera = ePrev || conservadas[0];
  const ultima = pOut || conservadas[conservadas.length - 1];

  // Ubicaciones (String legacy) y plantas
  const ubicEntrada = primera.checador?.Ubicacion_Codigo || primera.checador?.planta?.Nombre || primera.Ubicacion;
  const ubicSalida  = ultima.checador?.Ubicacion_Codigo  || ultima.checador?.planta?.Nombre  || ultima.Ubicacion;
  const plantaEntrada = primera.checador?.ID_Planta ?? null;
  const plantaSalida  = ultima.checador?.ID_Planta ?? null;
  const multiPlanta = plantaEntrada !== null && plantaSalida !== null && plantaEntrada !== plantaSalida;

  // Entrada nocturna: el día empieza a las 22:00 de la víspera (o la entrada real si fue después).
  const horaEntrada = ePrev
    ? new Date(Math.max(ePrev.Fecha_Hora.getTime(), fechaDia.getTime() - (1440 - CORTE_NOCTURNO_MIN) * 60000))
    : primera.Fecha_Hora;
  // Par abierto (cantidad impar: entra, sale, regresa) = sin salida. Antes la
  // última checada ("regresa") se guardaba como salida y el día aparecía cerrado.
  // Salida nocturna: la checada real de mañana.
  const horaSalida = pOut
    ? pOut.Fecha_Hora
    : ((conservadas.length >= 2 || aplicaIn) && !calc.incompleta ? ultima.Fecha_Hora : null);

  // CONFIRMADA/MANUAL/RECHAZADA las decide RH y no se pisan mientras el cruce
  // exista; si el día ya no tiene par abierto que cruce, se limpia (salvo RECHAZADA).
  const estadoActual = fila.Nocturna_Estado;
  const nocturnaEstado = pOut
    ? (ESTADOS_NOCTURNA_FIJOS.includes(estadoActual) ? estadoActual : 'AUTO')
    : (estadoActual === 'RECHAZADA' ? 'RECHAZADA' : null);

  await tx.empleados_Asistencia.update({
    where: { ID_Asistencia: fila.ID_Asistencia },
    data: {
      Hora_Entrada: horaEntrada,
      Hora_Salida: horaSalida,
      Horas_Trabajadas: calc.horasTrabajadas || 0,
      Horas_Extras: calc.horasExtras || 0,
      Minutos_Retardo: calc.minutosRetardo || 0,
      Retardo: calc.retardo || false,
      Presente: true,
      Ubicacion_Entrada: ubicEntrada || null,
      Ubicacion_Salida: horaSalida ? (ubicSalida || null) : null,
      ID_Checador_Entrada: primera.ID_Checador ?? null,
      ID_Checador_Salida: horaSalida ? (ultima.ID_Checador ?? null) : null,
      Multi_Planta: multiPlanta,
      Notas: (huerfana ? 'Salida sin entrada (noche anterior) · ' : '') + (pOut && !aplicaOut ? 'Nocturna por confirmar (no suma) · ' : '') + (calc.notas || ''),
      Nocturna_Estado: nocturnaEstado,
      Nocturna_Entrante: !!(pIn || huerfana),
      UpdatedAt: new Date()
    }
  });

  // Marcar tipos de checada y el Estado de la ENTRADA en historial, para coherencia con
  // las vistas (que muestran Historial_Checadas.Estado). El retardo sale de calc (misma
  // fuente que la jornada). La salida nocturna recibida (pIn) es SALIDA, no entrada.
  const estadoEntrada = calc.retardo ? 'RETARDO' : 'A_TIEMPO';
  if (pIn || huerfana) {
    await tx.historial_Checadas.update({ where: { ID_Checada: (pIn || huerfana).ID_Checada }, data: { Tipo_Checada: 'SALIDA' } });
  }
  if (propias.length) {
    await tx.historial_Checadas.update({
      where: { ID_Checada: propias[0].ID_Checada },
      data: { Tipo_Checada: 'ENTRADA', Estado: estadoEntrada }
    });
  }
  if (horaSalida && ultima !== pIn && ultima !== propias[0]) {
    await tx.historial_Checadas.update({ where: { ID_Checada: ultima.ID_Checada }, data: { Tipo_Checada: 'SALIDA' } });
  }
  return !!pOut;
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
 * Body ZK típico: "ID=<n>&Return=<code>&CMD=<cmd>", una línea por comando: el
 * device confirma varios en un solo POST. Antes solo se leía la primera línea;
 * las demás quedaban en 'enviado' y se reenviaban cada 2 min hasta agotar
 * intentos (un BLOQUEO reenviado podía pisar una reactivación posterior).
 */
export async function confirmarComando(body) {
  const lineas = String(body || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const resultados = [];
  for (const linea of lineas) resultados.push(await confirmarLineaComando(linea));
  return resultados;
}

async function confirmarLineaComando(body) {
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
