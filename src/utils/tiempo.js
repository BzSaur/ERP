/**
 * Utilidades de tiempo independientes del TZ del proceso Node.
 *
 * El reloj de los checadores y los reportes usan la zona horaria de México.
 * Estas funciones derivan los componentes locales vía Intl con timeZone
 * explícito, así el resultado es correcto aunque el proceso corra en UTC.
 */

import config from '../config/env.js';

/**
 * Componentes de fecha/hora en la zona horaria del checador (default
 * America/Mexico_City), independiente del TZ del proceso.
 * @param {Date} date
 * @returns {{fecha: string, hora: string}} fecha=YYYY-MM-DD, hora=HH:MM:SS
 */
export function horaLocalDevice(date = new Date()) {
  const tz = config.adms.tzName || 'America/Mexico_City';
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const p = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  // en-CA usa hour '24' a medianoche; normalizar a '00'
  const hh = p.hour === '24' ? '00' : p.hour;
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${hh}:${p.minute}:${p.second}` };
}

/**
 * ¿La fecha dada corresponde al día EN CURSO (hoy) en la zona del checador?
 * Compara solo la parte YYYY-MM-DD, así no importa la hora ni el TZ del proceso.
 * @param {Date|string} fecha  Date o 'YYYY-MM-DD'
 * @returns {boolean}
 */
export function esDiaEnCurso(fecha) {
  const hoy = horaLocalDevice().fecha;
  let f;
  if (typeof fecha === 'string') {
    f = fecha.slice(0, 10);
  } else {
    // Mediodía evita que el shift de TZ caiga al día anterior/siguiente
    const d = new Date(fecha);
    f = horaLocalDevice(new Date(`${d.toISOString().slice(0,10)}T12:00:00`)).fecha;
  }
  return f === hoy;
}

/**
 * Minutos transcurridos del día actual en la zona del checador (0..1439).
 * Sirve como "hora de corte" para jornadas aún abiertas (sin salida).
 * @returns {number}
 */
export function minutosDelDiaAhora() {
  const { hora } = horaLocalDevice();
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

export default { horaLocalDevice, esDiaEnCurso, minutosDelDiaAhora };
