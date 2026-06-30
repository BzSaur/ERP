/**
 * Generador de Excel de horas trabajadas (estilo checador Steren, para RH).
 *
 * Matriz: filas = empleados, columnas = días del rango. Por cada día tres
 * columnas: Entrada | Salida | Horas. Entrada/Salida con sufijo de planta
 * (ej. "08:00 (RAM 1)") para visibilizar multi-planta. Columna final: total
 * de horas del rango por empleado.
 *
 * Reutiliza el cálculo de horas ya consolidado (Empleados_Asistencia.Horas_Trabajadas,
 * llenado por ADMS/XLSX con calcularHorasPorPares).
 */

import * as XLSX from 'xlsx';
import prisma from '../config/database.js';
import { esAreaCoberturaEspecial, entradaCobertura, reglaToleranciaPorFecha } from './checadorImportService.js';

/**
 * Entrada a MOSTRAR (Date). El redondeo a HH:00 NO se aplica aquí (lo hace, aparte, el
 * selector "Redondear horas"). Misma lógica que asistenciaService.entradaPagoDesde.
 */
function entradaPagoDesdeXls(horaEntradaReal, empleado) {
  if (!horaEntradaReal) return null;
  const d = new Date(horaEntradaReal);
  const { aplicaCobertura } = reglaToleranciaPorFecha(d);
  if (!aplicaCobertura) return d;
  const cobertura = esAreaCoberturaEspecial({ area: empleado?.area?.Nombre_Area, puesto: empleado?.puesto?.Nombre_Puesto });
  if (!cobertura) return d;
  const realMin = d.getHours() * 60 + d.getMinutes();
  const showMin = entradaCobertura(realMin).mostrarMin;
  const out = new Date(d);
  out.setHours(Math.floor(showMin / 60), showMin % 60, 0, 0);
  return out;
}

const NOMBRES_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function fmtHora(d) {
  if (!d) return '';
  const dt = new Date(d);
  return String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
}

function fmtFechaCorta(d) {
  const dt = new Date(d);
  return String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0');
}

/** Lista de días (Date a medianoche) entre inicio y fin inclusive. */
function rangoDias(inicio, fin) {
  const dias = [];
  const cur = new Date(inicio); cur.setHours(0, 0, 0, 0);
  const end = new Date(fin); end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    dias.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dias;
}

/**
 * Genera el buffer XLSX de la matriz de horas.
 * @param {Date} fechaInicio
 * @param {Date} fechaFin
 * @returns {Buffer}
 */
function redondearEntradaExcel(hhmm) {
  if (!hhmm) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  return String(m <= 15 ? h : h + 1).padStart(2, '0') + ':00';
}
function redondearSalidaExcel(hhmm) {
  if (!hhmm) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  // Baja a la hora si m<=55; sube solo en los últimos 4 min (m>=56).
  // Ej: 8:54->8:00, 8:56->9:00, 18:30->18:00.
  return String(m <= 55 ? h : h + 1).padStart(2, '0') + ':00';
}

// Límite semanal fijo de horas normales; el excedente es extra.
const LIMITE_SEMANAL_HORAS = 45;
function horasEntreRedondeadas(ent, sal) {
  const [he, me] = ent.split(':').map(Number);
  const [hs, ms] = sal.split(':').map(Number);
  const COMIDA_INI = 14 * 60, COMIDA_FIN = 15 * 60;
  const entMin = he * 60 + me, salMin = hs * 60 + ms;
  if (salMin <= entMin) return 0;
  let netos = salMin - entMin;
  if (entMin < COMIDA_FIN && salMin > COMIDA_INI) {
    netos -= Math.min(salMin, COMIDA_FIN) - Math.max(entMin, COMIDA_INI);
  }
  return Math.round(Math.max(0, netos) / 60 * 100) / 100;
}

export async function generarExcelHoras(fechaInicio, fechaFin, opciones = {}) {
  const { sort = null, dir = 'asc', redondear = false } = opciones;
  const inicio = new Date(fechaInicio); inicio.setHours(0, 0, 0, 0);
  const fin = new Date(fechaFin); fin.setHours(23, 59, 59, 999);
  const dias = rangoDias(inicio, fin);

  const empleados = await prisma.empleados.findMany({
    where: { ID_Estatus: 1 },
    select: {
      ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true,
      area: { select: { Nombre_Area: true } },
      puesto: { select: { Nombre_Puesto: true } }
    },
    orderBy: [{ Apellido_Paterno: 'asc' }, { Nombre: 'asc' }]
  });

  // Horas/retardo desde Empleados_Asistencia (BD ya consolidada por ADMS).
  // Misma fuente que la vista /asistencia/horas.

  // Asistencias del rango con checadas + planta de cada checada
  const asistencias = await prisma.empleados_Asistencia.findMany({
    where: { Fecha: { gte: inicio, lte: fin } },
    select: {
      ID_Empleado: true, Fecha: true, Hora_Entrada: true, Hora_Salida: true,
      Horas_Trabajadas: true, Multi_Planta: true,
      Ubicacion_Entrada: true, Ubicacion_Salida: true,
      historial_checadas: {
        orderBy: { Fecha_Hora: 'asc' },
        select: { Fecha_Hora: true, checador: { select: { planta: { select: { Nombre: true } }, Ubicacion_Codigo: true } }, Ubicacion: true }
      }
    }
  });

  // Index: ID_Empleado -> (yyyy-mm-dd -> asistencia)
  const idx = new Map();
  for (const a of asistencias) {
    const key = new Date(a.Fecha).toISOString().slice(0, 10);
    if (!idx.has(a.ID_Empleado)) idx.set(a.ID_Empleado, new Map());
    idx.get(a.ID_Empleado).set(key, a);
  }

  // ---- Construir AOA (array of arrays) ----
  const aoa = [];

  // Fila 1: título + rango
  aoa.push([`Reporte de Horas — ${fmtFechaCorta(inicio)} al ${fmtFechaCorta(fin)}`]);
  aoa.push([]); // espacio

  // Fila cabecera 1: agrupa por día (ID, Nombre, Área, [Día] x3, ..., Total)
  const head1 = ['ID', 'Nombre', 'Área'];
  const head2 = ['', '', ''];
  for (const d of dias) {
    head1.push(`${NOMBRES_DIA[d.getDay()]} ${fmtFechaCorta(d)}`, '', '');
    head2.push('Entrada', 'Salida', 'Horas');
  }
  head1.push('Total hrs', 'Normal', 'Extra');
  head2.push('', `(≤${LIMITE_SEMANAL_HORAS}h)`, `(>${LIMITE_SEMANAL_HORAS}h)`);
  aoa.push(head1);
  aoa.push(head2);

  // Construir fila por empleado (con total para poder ordenar)
  const filas = empleados.map(e => {
    const nombre = [e.Nombre, e.Apellido_Paterno, e.Apellido_Materno].filter(Boolean).join(' ');
    const fila = [e.ID_Empleado, nombre, e.area?.Nombre_Area || ''];
    let totalHoras = 0;

    for (const d of dias) {
      const key = d.toISOString().slice(0, 10);
      const a = idx.get(e.ID_Empleado)?.get(key);
      if (!a) { fila.push('', '', ''); continue; }

      const plantaEnt = a.Ubicacion_Entrada || a.historial_checadas[0]?.checador?.planta?.Nombre || '';
      const ultCheca = a.historial_checadas[a.historial_checadas.length - 1];
      const plantaSal = a.Ubicacion_Salida || ultCheca?.checador?.planta?.Nombre || '';

      const entradaPago = entradaPagoDesdeXls(a.Hora_Entrada, e);
      const entRaw = entradaPago ? fmtHora(entradaPago) : null;
      const salRaw = a.Hora_Salida ? fmtHora(a.Hora_Salida) : null;
      let entMostrar = entRaw ? `${entRaw}${plantaEnt ? ' (' + plantaEnt + ')' : ''}` : '';
      let salMostrar = salRaw ? `${salRaw}${plantaSal ? ' (' + plantaSal + ')' : ''}` : '';
      // Horas consolidadas en BD (misma fuente que la vista /asistencia/horas).
      let horas = Number(a.Horas_Trabajadas) || 0;

      if (redondear && entRaw && salRaw) {
        const entR = redondearEntradaExcel(entRaw);
        const salR = redondearSalidaExcel(salRaw);
        entMostrar = `${entR}${plantaEnt ? ' (' + plantaEnt + ')' : ''}`;
        salMostrar = `${salR}${plantaSal ? ' (' + plantaSal + ')' : ''}`;
        horas = horasEntreRedondeadas(entR, salR);
      }

      totalHoras += horas;
      fila.push(entMostrar, salMostrar, horas ? Math.round(horas * 100) / 100 : '');
    }

    const total = Math.round(totalHoras * 100) / 100;
    // Split semanal: extra = excedente sobre 45h (incluye sábado en el total).
    const extra = Math.max(0, Math.round((total - LIMITE_SEMANAL_HORAS) * 100) / 100);
    const normal = Math.round((total - extra) * 100) / 100;
    fila.push(total, normal, extra);
    return { fila, id: e.ID_Empleado, nombre, total };
  });

  // Ordenar según el filtro seleccionado en la vista (id | nombre | total)
  if (sort) {
    const asc = dir !== 'desc';
    filas.sort((a, b) => {
      if (sort === 'id') return asc ? a.id - b.id : b.id - a.id;
      if (sort === 'total') return asc ? a.total - b.total : b.total - a.total;
      // nombre
      return asc ? a.nombre.localeCompare(b.nombre) : b.nombre.localeCompare(a.nombre);
    });
  }

  for (const r of filas) aoa.push(r.fila);

  // ---- Hoja + anchos ----
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const cols = [{ wch: 6 }, { wch: 28 }, { wch: 16 }];
  for (let i = 0; i < dias.length; i++) cols.push({ wch: 14 }, { wch: 14 }, { wch: 7 });
  cols.push({ wch: 9 }, { wch: 8 }, { wch: 8 });
  ws['!cols'] = cols;

  // Merge del título sobre las primeras columnas
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Horas');

  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
}

export default { generarExcelHoras };
