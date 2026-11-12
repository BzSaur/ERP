import { esFestivo } from '../services/diasFestivosService.js';
import { horaLocalDevice } from './tiempo.js';

/**
 * Bono de puntualidad: se gana solo si TODOS los días hábiles (lunes a viernes,
 * sin festivos) del periodo tiene entrada a las 08:00 o antes. Cualquier
 * ausencia lo quita (falta, vacaciones, permiso, actividad sin checada). Sin
 * tolerancia. Misma regla para asistencia y nómina.
 *
 * @param {object} p
 * @param {string[]} p.fechas    días del periodo 'YYYY-MM-DD' (locales)
 * @param {Map<string, Date>} p.entradas  'YYYY-MM-DD' -> Hora_Entrada del día presente
 * @param {(key: string) => boolean} [p.esFestivo]
 * @param {string} p.hoy         'YYYY-MM-DD' local; hoy/futuros sin entrada = pendiente
 * @returns {{ aplica: boolean, pendiente: boolean, fallas: {fecha: string, motivo: string}[] }}
 */
export function evaluarBonoPuntualidad({ fechas, entradas, esFestivo = () => false, hoy }) {
  const fallas = [];
  let pendiente = false;
  for (const key of fechas) {
    const dow = new Date(`${key}T12:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6 || esFestivo(key)) continue;
    const ent = entradas.get(key);
    if (ent) {
      // "A las 8 o antes": cuenta el minuto 08:00 completo. La entrada nocturna
      // (22:00 de la víspera) también es antes de las 8.
      const limite = new Date(`${key}T08:00:59.999`);
      if (new Date(ent) > limite) {
        const d = new Date(ent);
        fallas.push({ fecha: key, motivo: `entró ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` });
      }
      continue;
    }
    if (key >= hoy) { pendiente = true; continue; }
    fallas.push({ fecha: key, motivo: 'sin entrada' });
  }
  return { aplica: fallas.length === 0 && !pendiente, pendiente: fallas.length === 0 && pendiente, fallas };
}

export const claveDiaLocal = (f) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;

/**
 * Bono del rango a partir de filas de Empleados_Asistencia de UN empleado
 * ({Fecha @db.Date, Presente, Hora_Entrada}).
 * @param {Date} fechaInicio @param {Date} fechaFin  días locales (medianoche México)
 */
export function bonoDeAsistencias(asistencias, fechaInicio, fechaFin) {
  const entradas = new Map();
  for (const a of asistencias) {
    if (a.Presente && a.Hora_Entrada) entradas.set(new Date(a.Fecha).toISOString().slice(0, 10), a.Hora_Entrada);
  }
  const fechas = [];
  const d = new Date(fechaInicio); d.setHours(0, 0, 0, 0);
  const fin = new Date(fechaFin); fin.setHours(0, 0, 0, 0);
  for (; d <= fin; d.setDate(d.getDate() + 1)) fechas.push(claveDiaLocal(d));
  return evaluarBonoPuntualidad({
    fechas, entradas,
    esFestivo: (k) => esFestivo(`${k}T12:00:00Z`),
    hoy: horaLocalDevice().fecha
  });
}
