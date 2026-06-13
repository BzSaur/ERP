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

export default { horaLocalDevice };
