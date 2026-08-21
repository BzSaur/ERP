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
import { asistenciaVisible, obtenerAusenciasJustificadas, ausenciaEnFecha, periodoAusenciaEnFecha, ganadorDelDia, resolverActividadesPorRango, horasDeActividad, esDiaDescanso } from './asistenciaService.js';

// Horas fijas que cuenta un día de Campo/Home Office sin checada (jornada
// completa), consistente con la misma regla usada en las vistas HTML.
const HORAS_FIJAS_ACTIVIDAD = 9;

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
/**
 * Redondeo a la hora MAS CERCANA (>=30 min sube, <30 baja), igual en entrada y
 * salida. Debe coincidir con `aLaHoraMasCercana` de horas-todos.ejs: si el
 * Excel redondeara distinto, no cuadraria con la tabla que RH acaba de ver.
 *
 * Las reglas anteriores (entrada subia desde el minuto 16, salida bajaba hasta
 * el 55) sesgaban el resultado siempre en la misma direccion y restaban 5.68 h
 * sobre 10 jornadas reales.
 */
function redondearHoraExcel(hhmm) {
  if (!hhmm) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  return String(m >= 30 ? h + 1 : h).padStart(2, '0') + ':00';
}
const redondearEntradaExcel = redondearHoraExcel;
const redondearSalidaExcel = redondearHoraExcel;

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
  const { sort = null, dir = 'asc', redondear = false, filtro = null } = opciones;
  const inicio = new Date(fechaInicio); inicio.setHours(0, 0, 0, 0);
  const fin = new Date(fechaFin); fin.setHours(23, 59, 59, 999);
  const dias = rangoDias(inicio, fin);

  let empleados = await prisma.empleados.findMany({
    // Mismo criterio que la vista HTML: sigue quien no está de BAJA, incluidos
    // vacaciones, incapacidad y suspendidos. Si el Excel filtrara distinto, no
    // cuadraría con la tabla que el usuario acaba de ver.
    where: filtro?.idsPermitidos
      ? {
          ID_Empleado: { in: filtro.idsPermitidos },
          estatus: { is: { Nombre_Estatus: { not: 'BAJA' } } }
        }
      : { estatus: { is: { Nombre_Estatus: { not: 'BAJA' } } } },
    select: {
      ID_Empleado: true, ID_Area: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true,
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

  // Vacaciones / incidencias aprobadas: etiquetar el día en vez de dejarlo vacío.
  const ausencias = await obtenerAusenciasJustificadas(inicio, fin);

  // Actividades (campo/home office, puntuales + recurrencia resuelta): días
  // delegados sin checada se etiquetan y cuentan 9h fijas, igual que en las
  // vistas HTML de horas.
  const actividadesMap = await resolverActividadesPorRango(empleados.map(e => e.ID_Empleado), inicio, fin);

  // Index: ID_Empleado -> (yyyy-mm-dd -> asistencia)
  const idx = new Map();
  for (const a of asistencias) {
    const key = new Date(a.Fecha).toISOString().slice(0, 10);
    if (!idx.has(a.ID_Empleado)) idx.set(a.ID_Empleado, new Map());
    idx.get(a.ID_Empleado).set(key, a);
  }

  // Filtro de visibilidad del consultor (unión planta/área). Empleado visible si su área
  // está permitida, o si tuvo alguna asistencia en una planta permitida. idsPermitidos
  // (equipo de un encargado) es independiente y ya se aplicó en la query de empleados.
  if (filtro && (filtro.plantaIds || filtro.areaIds)) {
    const plantasCat = await prisma.cat_Plantas.findMany({ select: { ID_Planta: true, Nombre: true } });
    const norm = s => (s || '').toString().trim().toUpperCase().replace(/\s+/g, '');
    const strAPlanta = new Map();
    for (const pl of plantasCat) strAPlanta.set(norm(pl.Nombre), pl.ID_Planta);
    const empConPlantaOk = new Set();
    for (const a of asistencias) {
      const nombrePlanta = a.Ubicacion_Entrada || a.historial_checadas[0]?.checador?.planta?.Nombre;
      const idP = strAPlanta.get(norm(nombrePlanta)) ?? null;
      if (idP != null && filtro.plantaIds.has(idP)) empConPlantaOk.add(a.ID_Empleado);
    }
    empleados = empleados.filter(e =>
      asistenciaVisible({ idPlanta: null, idArea: e.ID_Area }, filtro) || empConPlantaOk.has(e.ID_Empleado)
    );
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
    head1.push(`${NOMBRES_DIA[d.getUTCDay()]} ${fmtFechaCorta(d)}`, '', '');
    head2.push('Entrada', 'Salida', 'Horas');
  }
  head1.push('Total hrs', 'Normal', 'Extra');
  head2.push('', `(≤${LIMITE_SEMANAL_HORAS}h)`, `(>${LIMITE_SEMANAL_HORAS}h)`);
  aoa.push(head1);
  aoa.push(head2);

  // Detalle plano de actividades, para la hoja aparte. Con ~120 empleados y
  // pocos con actividad, buscarlas dentro de la matriz es impráctico: esta
  // lista solo tiene las filas que existen.
  const detalleActividades = [];

  // Construir fila por empleado (con total para poder ordenar)
  const filas = empleados.map(e => {
    const nombre = [e.Nombre, e.Apellido_Paterno, e.Apellido_Materno].filter(Boolean).join(' ');
    const fila = [e.ID_Empleado, nombre, e.area?.Nombre_Area || ''];
    let totalHoras = 0;

    for (const d of dias) {
      const key = d.toISOString().slice(0, 10);
      const a = idx.get(e.ID_Empleado)?.get(key);
      if (!a) {
        if (esDiaDescanso(d)) { fila.push('', '', ''); continue; }
        const periodoAus = periodoAusenciaEnFecha(ausencias, e.ID_Empleado, d);
        const actividadRaw = actividadesMap.get(`${e.ID_Empleado}_${key}`) || null;
        if (!periodoAus && !actividadRaw) { fila.push('', '', ''); continue; }

        // Ausencia y actividad el mismo día: gana la asignada al último.
        const fmtMin = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
        if (ganadorDelDia(periodoAus, actividadRaw) === 'ACTIVIDAD') {
          // Sin checada: el tramo capturado manda; si no hay, jornada fija.
          const horasAct = horasDeActividad(actividadRaw, null);
          // Un día puede tener VARIAS actividades: el Excel las lista todas,
          // porque este reporte también justifica el trabajo realizado.
          const listaAct = actividadRaw.todas || [actividadRaw];
          const desc = listaAct.map(av => {
            const emp = av.empresa ? ` (${av.empresa})` : '';
            return `${av.tipo.toUpperCase()}: ${av.nombre}${emp}${av.esRecurrente ? ' [recurrente]' : ''}`;
          }).join(' + ');
          const horarios = listaAct
            .filter(av => Number.isFinite(av.horaInicio) && Number.isFinite(av.horaFin))
            .map(av => `${fmtMin(av.horaInicio)}-${fmtMin(av.horaFin)}`)
            .join(' + ');
          fila.push(desc, horarios, horasAct);
          totalHoras += horasAct;

          listaAct.forEach(av => detalleActividades.push({
            id: e.ID_Empleado, nombre, area: e.area?.Nombre_Area || '',
            fecha: key, nombreDia: NOMBRES_DIA[d.getUTCDay()],
            tipo: av.tipo, actividad: av.nombre, empresa: av.empresa || '',
            horario: (Number.isFinite(av.horaInicio) && Number.isFinite(av.horaFin))
              ? `${fmtMin(av.horaInicio)}-${fmtMin(av.horaFin)}` : 'Jornada completa',
            recurrente: av.esRecurrente ? 'Sí' : 'No',
            encargado: av.responsable || '',
            checada: 'Sin checada'
          }));
        } else {
          // Ausencia: paga jornada completa solo si es CON goce de sueldo.
          // Las sin goce (falta injustificada, permiso sin goce…) se etiquetan
          // pero no suman horas.
          const horasAus = periodoAus.conGoce ? HORAS_FIJAS_ACTIVIDAD : 0;
          fila.push(
            periodoAus.etiqueta.toUpperCase() + (periodoAus.conGoce ? '' : ' (sin goce)'),
            '',
            horasAus || ''
          );
          totalHoras += horasAus;
        }
        continue;
      }

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
        const hr = horasEntreRedondeadas(entR, salR);
        // Jornada tan corta que el redondeo la colapsa: se conservan las horas
        // reales en vez de escribir 0 (mismo criterio que la vista HTML).
        horas = hr > 0 ? hr : horas;
      }

      // Actividad delegada Y checada real el mismo día: se suman el tramo de la
      // actividad (capturado, o 8am→primera entrada) y las horas reales —
      // mismo criterio que la vista HTML /asistencia/horas.
      const actividadConChecada = d.getUTCDay() !== 0 ? (actividadesMap.get(`${e.ID_Empleado}_${key}`) || null) : null;
      if (actividadConChecada) {
        horas += horasDeActividad(actividadConChecada, a.Hora_Entrada, a.Hora_Salida);

        // El reporte también justifica el trabajo delegado: la actividad se
        // anota junto a la checada, no solo sus horas. Antes se perdía.
        const fmtMinC = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
        const listaC = actividadConChecada.todas || [actividadConChecada];
        const descC = listaC.map(av => {
          const tramo = (Number.isFinite(av.horaInicio) && Number.isFinite(av.horaFin))
            ? ` ${fmtMinC(av.horaInicio)}-${fmtMinC(av.horaFin)}` : '';
          return `${av.tipo.toUpperCase()}: ${av.nombre}${tramo}${av.esRecurrente ? ' [recurrente]' : ''}`;
        }).join(' + ');
        entMostrar = entMostrar ? `${entMostrar}\n${descC}` : descC;

        listaC.forEach(av => detalleActividades.push({
          id: e.ID_Empleado, nombre, area: e.area?.Nombre_Area || '',
          fecha: key, nombreDia: NOMBRES_DIA[d.getUTCDay()],
          tipo: av.tipo, actividad: av.nombre, empresa: av.empresa || '',
          horario: (Number.isFinite(av.horaInicio) && Number.isFinite(av.horaFin))
            ? `${fmtMinC(av.horaInicio)}-${fmtMinC(av.horaFin)}` : 'Jornada completa',
          recurrente: av.esRecurrente ? 'Sí' : 'No',
          encargado: av.responsable || '',
          checada: `${entRaw || '--:--'} / ${salRaw || '--:--'}`
        }));
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

  // Orden del reporte. Con ~120 empleados el orden importa para poder
  // comparar descargas entre sí, así que SIEMPRE se ordena de forma
  // determinista: por lo que pidió la vista, y en su defecto por nombre.
  // El ID desempata para que dos homónimos no bailen entre descargas.
  const asc = dir !== 'desc';
  const criterio = sort || 'nombre';
  filas.sort((a, b) => {
    let cmp;
    if (criterio === 'id') cmp = a.id - b.id;
    else if (criterio === 'total') cmp = a.total - b.total;
    else cmp = a.nombre.localeCompare(b.nombre, 'es');
    if (cmp === 0) cmp = a.id - b.id; // desempate estable
    return asc ? cmp : -cmp;
  });

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

  // ---- Hoja 2: detalle de actividades delegadas ----
  // Una fila por actividad y día. Sirve para justificar el trabajo sin tener
  // que rastrearlo dentro de la matriz de toda la plantilla.
  if (detalleActividades.length > 0) {
    // Mismo orden que la matriz, para poder leerlas en paralelo.
    const posEmpleado = new Map(filas.map((f, i) => [f.id, i]));
    detalleActividades.sort((a, b) => {
      const pa = posEmpleado.get(a.id) ?? 0, pb = posEmpleado.get(b.id) ?? 0;
      return pa - pb || a.fecha.localeCompare(b.fecha) || a.horario.localeCompare(b.horario);
    });

    const aoaAct = [
      [`Actividades delegadas — ${fmtFechaCorta(inicio)} al ${fmtFechaCorta(fin)}`],
      [`${detalleActividades.length} actividad(es) en el periodo`],
      [],
      ['ID', 'Empleado', 'Área', 'Día', 'Fecha', 'Tipo', 'Actividad', 'Empresa', 'Horario', 'Recurrente', 'Encargado', 'Checada del día']
    ];
    for (const r of detalleActividades) {
      aoaAct.push([
        r.id, r.nombre, r.area, r.nombreDia,
        new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-MX'),
        r.tipo, r.actividad, r.empresa, r.horario, r.recurrente, r.encargado, r.checada
      ]);
    }

    const wsAct = XLSX.utils.aoa_to_sheet(aoaAct);
    wsAct['!cols'] = [
      { wch: 6 }, { wch: 28 }, { wch: 16 }, { wch: 6 }, { wch: 12 },
      { wch: 14 }, { wch: 26 }, { wch: 18 }, { wch: 15 }, { wch: 11 }, { wch: 22 }, { wch: 16 }
    ];
    wsAct['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: aoaAct.length - 1, c: 11 } }) };
    wsAct['!freeze'] = { xSplit: 0, ySplit: 4 };
    XLSX.utils.book_append_sheet(wb, wsAct, 'Actividades');
  }

  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
}

export default { generarExcelHoras };
