/**
 * Servicio de Importación de Checadores - RAM
 *
 * Parsea archivos XLSX exportados de los checadores biométricos (RAM1/RAM2)
 * y calcula automáticamente las horas trabajadas por empleado por día.
 *
 * Reglas de negocio:
 * - Jornada completa: 8:00 - 18:00 (9h netas, 1h comida 14-15)
 * - Tolerancia 15 min por hora: 8:15→paga 8:00, 8:16→paga 9:00
 * - Tiempo completo: retardo + ajuste de pago
 * - Mixto: solo ajuste de pago (sin retardo)
 * - Horas después de 18:00 = extras
 * - Sábados completos = extras
 * - Si entrada RAM1, salida RAM2 → ubicación = RAM2
 * - Mixtos: 30h HO + 15h presencial = 45h cap, >15h presencial = extras
 *
 * Formato del XLSX del checador:
 * - Fila 0: Título "Registros de asistencia"
 * - Fila 1: Rango de fechas "YYYY-MM-DD ~ YYYY-MM-DD"
 * - Por cada empleado (bloques de 4 filas):
 *   - Fila ID: "ID." | _ | número | ... | "Nombre" | _ | nombre_empleado | ... | "Depart." | _ | departamento
 *   - Fila días: números de día del mes
 *   - Fila nombres: nombres de día (Jue, Vie, Sáb, Dom, Lun, Mar, Mié)
 *   - Fila checadas: tiempos separados por \n (ej: "08:00\n17:07")
 */

import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================
// CONFIGURACIÓN DE HORARIOS
// ============================================================

const COMIDA_INICIO_DEFAULT = 14 * 60;       // 14:00 en minutos
const COMIDA_FIN_DEFAULT = 15 * 60;           // 15:00 en minutos

const HORA_ENTRADA_ESTANDAR = 8 * 60;         // 08:00
const HORA_SALIDA_ESTANDAR = 18 * 60;         // 18:00
const HORA_EXTRAS_INICIO = 18 * 60;            // Después de 18:00 = horas extras
const JORNADA_COMPLETA_HORAS = 9;              // 9 horas efectivas (10 - 1h comida)
const TOLERANCIA_MINUTOS = 15;                 // 15 min tolerancia por hora

// Mixtos
const MIXTO_HORAS_PRESENCIALES_SEMANA = 15;    // 15h presenciales semanales
const MIXTO_HORAS_TOTALES_SEMANA = 45;         // 45h cap semanal

// ============================================================
// PARSER PRINCIPAL DEL XLSX
// ============================================================

/**
 * Parsea un archivo XLSX del checador biométrico
 */
export function parsearArchivoChecador(fileBuffer, ubicacion = 'RAM1', opciones = {}) {
  const {
    comidaInicio = COMIDA_INICIO_DEFAULT,
    comidaFin = COMIDA_FIN_DEFAULT,
    empleadosMixtos = new Set()  // Set de nombres normalizados de empleados mixtos
  } = opciones;

  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const datos = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (datos.length < 3) {
    throw new Error('El archivo no tiene el formato esperado del checador');
  }

  const rangoFechas = extraerRangoFechas(datos);
  const empleados = parsearEmpleados(datos, rangoFechas, ubicacion, { comidaInicio, comidaFin, empleadosMixtos });
  const resumen = calcularResumenGeneral(empleados, rangoFechas);

  return {
    ubicacion,
    rangoFechas,
    empleados,
    resumen,
    totalEmpleados: empleados.length,
    importadoEl: new Date()
  };
}

/**
 * Combina los datos de dos checadores (RAM1 y RAM2)
 */
export function combinarChecadores(datosRAM1, datosRAM2) {
  if (!datosRAM1 && !datosRAM2) {
    throw new Error('Se requiere al menos un archivo de checador');
  }
  if (!datosRAM1) return { ...datosRAM2, ubicacion: 'RAM2' };
  if (!datosRAM2) return { ...datosRAM1, ubicacion: 'RAM1' };

  const rango1 = datosRAM1.rangoFechas;
  const rango2 = datosRAM2.rangoFechas;

  if (rango1.inicioStr !== rango2.inicioStr || rango1.finStr !== rango2.finStr) {
    console.warn('Los rangos de fechas de RAM1 y RAM2 no coinciden. Se usará la unión de ambos rangos.');
  }

  const empleadosMap = new Map();

  // Agregar empleados de RAM1
  for (const emp of datosRAM1.empleados) {
    const key = normalizarNombre(emp.nombre);
    empleadosMap.set(key, {
      ...emp,
      ubicaciones: ['RAM1'],
      diasPorUbicacion: { RAM1: emp.dias, RAM2: [] }
    });
  }

  // Combinar con empleados de RAM2
  for (const emp of datosRAM2.empleados) {
    const key = normalizarNombre(emp.nombre);

    if (empleadosMap.has(key)) {
      const existente = empleadosMap.get(key);
      existente.ubicaciones.push('RAM2');
      existente.diasPorUbicacion.RAM2 = emp.dias;

      // Combinar días con nueva lógica: RAM2 como ubicación si entrada RAM1 y salida RAM2
      existente.dias = combinarDiasEmpleado(existente.diasPorUbicacion.RAM1, emp.dias);

      const totales = recalcularTotales(existente.dias);
      existente.totalHorasTrabajadas = totales.totalHoras;
      existente.totalHorasNormales = totales.totalHorasNormales;
      existente.totalHorasExtras = totales.totalHorasExtras;
      existente.totalDiasTrabajados = totales.totalDias;
      existente.totalDiasAusente = totales.totalAusentes;
      existente.totalRetardos = totales.totalRetardos;
    } else {
      empleadosMap.set(key, {
        ...emp,
        ubicaciones: ['RAM2'],
        diasPorUbicacion: { RAM1: [], RAM2: emp.dias }
      });
    }
  }

  const empleadosCombinados = Array.from(empleadosMap.values());
  const rangoFechas = datosRAM1.rangoFechas;

  return {
    ubicacion: 'RAM1+RAM2',
    rangoFechas,
    empleados: empleadosCombinados,
    resumen: calcularResumenGeneral(empleadosCombinados, rangoFechas),
    totalEmpleados: empleadosCombinados.length,
    datosRAM1: { totalEmpleados: datosRAM1.totalEmpleados },
    datosRAM2: { totalEmpleados: datosRAM2.totalEmpleados },
    importadoEl: new Date()
  };
}

// ============================================================
// REDONDEO DE ENTRADA (TOLERANCIA 15 MIN POR HORA)
// ============================================================

/**
 * Redondea la hora de entrada para cálculo de pago.
 * Tolerancia de 15 minutos por hora:
 *   8:00-8:15 → paga desde 8:00
 *   8:16-9:00 → paga desde 9:00
 *   9:01-9:15 → paga desde 9:00
 *   9:16-10:00 → paga desde 10:00
 *   10:16-10:30 → paga desde 11:00
 *
 * @param {number} totalMinutos - Hora de entrada en minutos desde medianoche
 * @returns {number} Hora de pago en minutos desde medianoche
 */
function redondearEntrada(totalMinutos) {
  const minutosPasados = totalMinutos % 60;
  if (minutosPasados <= TOLERANCIA_MINUTOS) {
    return Math.floor(totalMinutos / 60) * 60;
  }
  return Math.ceil(totalMinutos / 60) * 60;
}

// ============================================================
// FUNCIONES INTERNAS DE PARSEO
// ============================================================

function extraerRangoFechas(datos) {
  let rangoStr = '';
  for (let i = 0; i < Math.min(5, datos.length); i++) {
    for (let j = 0; j < (datos[i] || []).length; j++) {
      const val = String(datos[i][j] || '');
      if (val.includes('~')) {
        rangoStr = val.trim();
        break;
      }
    }
    if (rangoStr) break;
  }

  if (!rangoStr) {
    throw new Error('No se encontró el rango de fechas en el archivo. Se esperaba formato "YYYY-MM-DD ~ YYYY-MM-DD"');
  }

  const partes = rangoStr.split('~').map(s => s.trim());
  const fechaInicio = new Date(partes[0]);
  const fechaFin = new Date(partes[1]);

  if (isNaN(fechaInicio.getTime()) || isNaN(fechaFin.getTime())) {
    throw new Error(`Formato de fecha inválido: "${rangoStr}"`);
  }

  const fechas = [];
  const current = new Date(fechaInicio);
  while (current <= fechaFin) {
    fechas.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return {
    inicio: fechaInicio,
    fin: fechaFin,
    inicioStr: partes[0],
    finStr: partes[1],
    fechas,
    totalDias: fechas.length
  };
}

function parsearEmpleados(datos, rangoFechas, ubicacion, opciones) {
  const empleados = [];

  for (let i = 0; i < datos.length; i++) {
    const fila = datos[i] || [];

    if (String(fila[0]).trim() === 'ID.') {
      const idChecador = parseInt(String(fila[2]).trim(), 10);

      let nombre = '';
      for (let j = 0; j < fila.length; j++) {
        if (String(fila[j]).trim() === 'Nombre' && j + 2 < fila.length) {
          nombre = String(fila[j + 2]).trim();
          break;
        }
      }
      if (!nombre) nombre = String(fila[11] || '').trim();

      let departamento = '';
      for (let j = 0; j < fila.length; j++) {
        if (String(fila[j]).trim() === 'Depart.' && j + 2 < fila.length) {
          departamento = String(fila[j + 2]).trim();
          break;
        }
      }

      // Determinar si es empleado mixto
      const nombreNorm = normalizarNombre(nombre);
      const esMixto = opciones.empleadosMixtos ? opciones.empleadosMixtos.has(nombreNorm) : false;

      const filaDias = datos[i + 1] || [];
      const filaNombresDia = datos[i + 2] || [];
      const filaChecadas = datos[i + 3] || [];

      const dias = parsearDiasEmpleado(filaDias, filaNombresDia, filaChecadas, rangoFechas, ubicacion, opciones, esMixto);
      const totales = recalcularTotales(dias);

      empleados.push({
        idChecador,
        nombre,
        departamento,
        ubicacion,
        esMixto,
        dias,
        totalHorasTrabajadas: totales.totalHoras,
        totalHorasNormales: totales.totalHorasNormales,
        totalHorasExtras: totales.totalHorasExtras,
        totalDiasTrabajados: totales.totalDias,
        totalDiasAusente: totales.totalAusentes,
        totalRetardos: totales.totalRetardos,
        totalDiasIncompletos: totales.totalIncompletos
      });

      i += 3;
    }
  }

  return empleados;
}

function parsearDiasEmpleado(filaDias, filaNombresDia, filaChecadas, rangoFechas, ubicacion, opciones, esMixto) {
  const dias = [];
  const numColumnas = Math.min(filaDias.length, rangoFechas.totalDias);

  for (let col = 0; col < numColumnas; col++) {
    const diaNum = parseInt(String(filaDias[col]).trim(), 10);
    const nombreDia = String(filaNombresDia[col] || '').trim();
    const checadasStr = String(filaChecadas[col] || '').trim();

    if (isNaN(diaNum)) continue;

    const fecha = rangoFechas.fechas[col] || null;
    const checadas = parsearChecadasDia(checadasStr);

    // Detectar si es sábado
    const esSabado = nombreDia && nombreDia.toLowerCase().startsWith('s\u00e1b');

    const calculo = calcularHorasDia(checadas, { ...opciones, esSabado, esMixto });

    dias.push({
      fecha,
      diaNum,
      nombreDia,
      ubicacion,
      checadas,
      checadasRaw: checadasStr === 'nan' || checadasStr === '' ? null : checadasStr,
      ...calculo
    });
  }

  return dias;
}

function parsearChecadasDia(checadasStr) {
  if (!checadasStr || checadasStr === 'nan' || checadasStr === 'NaN' || checadasStr === '') {
    return [];
  }

  return checadasStr
    .split('\n')
    .map(t => t.trim())
    .filter(t => t && /^\d{1,2}:\d{2}$/.test(t))
    .map(t => {
      const [hora, min] = t.split(':').map(Number);
      return {
        horaStr: t,
        hora,
        minuto: min,
        totalMinutos: hora * 60 + min
      };
    })
    .sort((a, b) => a.totalMinutos - b.totalMinutos);
}

// ============================================================
// CÁLCULO DE HORAS TRABAJADAS
// ============================================================

/**
 * Calcula las horas trabajadas en un día basándose en las checadas.
 *
 * Nuevas reglas:
 * - Entrada se redondea con tolerancia 15min/hora para pago
 * - Horas normales: entradaPago hasta min(salida, 18:00) menos comida
 * - Horas extras: después de 18:00
 * - Sábados: todas las horas son extras
 * - Mixto: sin marca de retardo (solo ajuste pago)
 * - Tiempo completo: retardo + ajuste pago
 */
function calcularHorasDia(checadas, opciones = {}) {
  const {
    comidaInicio = COMIDA_INICIO_DEFAULT,
    comidaFin = COMIDA_FIN_DEFAULT,
    esSabado = false,
    esMixto = false
  } = opciones;

  // Sin checadas = ausente
  if (!checadas || checadas.length === 0) {
    return {
      presente: false,
      entrada: null,
      entradaPago: null,
      salida: null,
      horasTrabajadas: 0,
      horasNormales: 0,
      horasExtras: 0,
      horasTrabajadasBruto: 0,
      minutosComidaDescontados: 0,
      minutosRetardo: 0,
      retardo: false,
      jornadaCompleta: false,
      incompleta: false,
      esSabado,
      notas: 'Sin checada'
    };
  }

  // Solo una checada = incompleta
  if (checadas.length === 1) {
    const entrada = checadas[0];
    const entradaPagoMin = redondearEntrada(entrada.totalMinutos);
    const minutosRetardo = Math.max(0, entradaPagoMin - HORA_ENTRADA_ESTANDAR);

    return {
      presente: true,
      entrada: entrada.horaStr,
      entradaPago: minutosAHora(entradaPagoMin),
      salida: null,
      horasTrabajadas: 0,
      horasNormales: 0,
      horasExtras: 0,
      horasTrabajadasBruto: 0,
      minutosComidaDescontados: 0,
      minutosRetardo: minutosRetardo > 0 ? minutosRetardo : 0,
      retardo: !esMixto && minutosRetardo > 0,
      jornadaCompleta: false,
      incompleta: true,
      esSabado,
      notas: 'Solo entrada registrada, falta salida'
    };
  }

  // Múltiples checadas
  const entrada = checadas[0];
  const salida = checadas[checadas.length - 1];

  // Redondear entrada para pago
  const entradaPagoMin = redondearEntrada(entrada.totalMinutos);
  const salidaMin = salida.totalMinutos;

  // Minutos brutos (entrada real a salida)
  const minutosBrutos = Math.max(0, salidaMin - entrada.totalMinutos);
  const horasTrabajadasBruto = Math.round((minutosBrutos / 60) * 100) / 100;

  // Minutos pagados (desde entrada redondeada)
  const minutosPagados = Math.max(0, salidaMin - entradaPagoMin);

  // Comida: se descuenta si la jornada (de pago) cruza 14:00-15:00
  let minutosComidaDescontados = 0;
  if (entradaPagoMin < comidaFin && salidaMin > comidaInicio) {
    const inicioOverlap = Math.max(entradaPagoMin, comidaInicio);
    const finOverlap = Math.min(salidaMin, comidaFin);
    minutosComidaDescontados = Math.max(0, finOverlap - inicioOverlap);
  }

  // Calcular horas normales y extras
  let horasNormales = 0;
  let horasExtras = 0;

  if (esSabado) {
    // Sábados: TODAS las horas son extras
    const minutosNetos = Math.max(0, minutosPagados - minutosComidaDescontados);
    horasExtras = Math.round((minutosNetos / 60) * 100) / 100;
    horasNormales = 0;
  } else {
    // Días normales: separar normales y extras
    // Horas normales = entradaPago hasta min(salida, 18:00) menos comida
    const finNormal = Math.min(salidaMin, HORA_EXTRAS_INICIO);
    const minutosNormalesBrutos = Math.max(0, finNormal - entradaPagoMin);

    // Comida se aplica a horas normales
    let comidaNormal = 0;
    if (entradaPagoMin < comidaFin && finNormal > comidaInicio) {
      const inicioO = Math.max(entradaPagoMin, comidaInicio);
      const finO = Math.min(finNormal, comidaFin);
      comidaNormal = Math.max(0, finO - inicioO);
    }

    const minutosNormalesNetos = Math.max(0, minutosNormalesBrutos - comidaNormal);
    horasNormales = Math.round((minutosNormalesNetos / 60) * 100) / 100;

    // Horas extras = después de 18:00
    if (salidaMin > HORA_EXTRAS_INICIO) {
      const minutosExtras = salidaMin - HORA_EXTRAS_INICIO;
      horasExtras = Math.round((minutosExtras / 60) * 100) / 100;
    }
  }

  const horasTrabajadas = Math.round((horasNormales + horasExtras) * 100) / 100;

  // Retardo: diferencia entre hora de pago y hora estándar
  const minutosRetardo = Math.max(0, entradaPagoMin - HORA_ENTRADA_ESTANDAR);
  // Solo marcar retardo para tiempo completo, mixto solo ajuste de pago
  const retardo = !esMixto && minutosRetardo > 0;

  // Jornada completa = 9h normales (sin contar extras)
  const jornadaCompleta = horasNormales >= JORNADA_COMPLETA_HORAS;

  const notas = generarNotasDia(entrada, salida, checadas, horasNormales, horasExtras, retardo, minutosRetardo, esSabado, esMixto);

  return {
    presente: true,
    entrada: entrada.horaStr,
    entradaPago: minutosAHora(entradaPagoMin),
    salida: salida.horaStr,
    horasTrabajadas,
    horasNormales,
    horasExtras,
    horasTrabajadasBruto,
    minutosComidaDescontados,
    minutosRetardo: minutosRetardo > 0 ? minutosRetardo : 0,
    retardo,
    jornadaCompleta,
    incompleta: false,
    esSabado,
    totalChecadas: checadas.length,
    checadasIntermedias: checadas.length > 2
      ? checadas.slice(1, -1).map(c => c.horaStr)
      : [],
    notas
  };
}

function generarNotasDia(entrada, salida, checadas, horasNormales, horasExtras, retardo, minutosRetardo, esSabado, esMixto) {
  const notas = [];

  if (retardo) {
    notas.push(`Retardo de ${minutosRetardo} min`);
  } else if (esMixto && minutosRetardo > 0) {
    notas.push(`Ajuste de pago: ${minutosRetardo} min`);
  }

  if (!esSabado && salida.totalMinutos < HORA_SALIDA_ESTANDAR) {
    const minAntes = HORA_SALIDA_ESTANDAR - salida.totalMinutos;
    if (minAntes > 5) {
      notas.push(`Salida ${minAntes} min antes`);
    }
  }

  if (esSabado) {
    notas.push(`Sábado (${horasExtras.toFixed(1)}h extras)`);
  } else if (horasExtras > 0) {
    notas.push(`${horasExtras.toFixed(1)}h extras`);
  }

  if (checadas.length > 2) {
    notas.push(`${checadas.length} checadas`);
  }

  if (!esSabado) {
    if (horasNormales >= JORNADA_COMPLETA_HORAS) {
      notas.push('Jornada completa');
    } else if (horasNormales > 0) {
      const faltantes = JORNADA_COMPLETA_HORAS - horasNormales;
      notas.push(`Faltan ${faltantes.toFixed(1)}h`);
    }
  }

  return notas.join(' | ');
}

// ============================================================
// COMBINACIÓN DE CHECADORES (RAM1 + RAM2)
// ============================================================

/**
 * Combina los días de un empleado de dos checadores.
 * Regla: Si entrada RAM1 y salida RAM2 → ubicación = RAM2
 */
function combinarDiasEmpleado(diasRAM1, diasRAM2) {
  const diasMap = new Map();

  for (const dia of diasRAM1) {
    diasMap.set(dia.diaNum, { ...dia });
  }

  for (const dia of diasRAM2) {
    const key = dia.diaNum;
    if (diasMap.has(key)) {
      const ram1 = diasMap.get(key);

      if (!ram1.presente && dia.presente) {
        // Solo RAM2 tiene checada
        diasMap.set(key, { ...dia, ubicacion: 'RAM2' });
      } else if (ram1.presente && dia.presente) {
        // Ambos tienen checadas
        // Si RAM1 tiene entrada y RAM2 tiene salida → ubicación RAM2
        if (ram1.entrada && dia.salida) {
          // Tomar entrada más temprana y salida más tardía
          const entradaMin = Math.min(
            ram1.checadas[0]?.totalMinutos || Infinity,
            dia.checadas[0]?.totalMinutos || Infinity
          );
          const salidaMax = Math.max(
            ram1.checadas[ram1.checadas.length - 1]?.totalMinutos || 0,
            dia.checadas[dia.checadas.length - 1]?.totalMinutos || 0
          );

          // Usar el día con más horas, marcar ubicación como RAM2 si salió ahí
          const usarRAM2 = dia.checadas[dia.checadas.length - 1]?.totalMinutos >= (ram1.checadas[ram1.checadas.length - 1]?.totalMinutos || 0);
          const base = usarRAM2 ? dia : ram1;

          diasMap.set(key, {
            ...base,
            ubicacion: 'RAM2',
            notas: `RAM1+RAM2. ${base.notas}`
          });
        } else if (dia.horasTrabajadas > ram1.horasTrabajadas) {
          diasMap.set(key, { ...dia, ubicacion: 'RAM1+RAM2', notas: `RAM1+RAM2. ${dia.notas}` });
        } else {
          ram1.ubicacion = 'RAM1+RAM2';
          ram1.notas = `RAM1+RAM2. ${ram1.notas}`;
        }
      }
    } else {
      diasMap.set(key, { ...dia, ubicacion: 'RAM2' });
    }
  }

  return Array.from(diasMap.values()).sort((a, b) => a.diaNum - b.diaNum);
}

// ============================================================
// CÁLCULO DE RESÚMENES
// ============================================================

function recalcularTotales(dias) {
  let totalHoras = 0;
  let totalHorasNormales = 0;
  let totalHorasExtras = 0;
  let totalDias = 0;
  let totalAusentes = 0;
  let totalRetardos = 0;
  let totalIncompletos = 0;

  for (const dia of dias) {
    if (dia.presente) {
      totalDias++;
      totalHoras += dia.horasTrabajadas || 0;
      totalHorasNormales += dia.horasNormales || 0;
      totalHorasExtras += dia.horasExtras || 0;
      if (dia.retardo) totalRetardos++;
      if (dia.incompleta) totalIncompletos++;
    } else {
      const esDomingo = dia.nombreDia && dia.nombreDia.toLowerCase().startsWith('dom');
      if (!esDomingo) {
        totalAusentes++;
      }
    }
  }

  return {
    totalHoras: Math.round(totalHoras * 100) / 100,
    totalHorasNormales: Math.round(totalHorasNormales * 100) / 100,
    totalHorasExtras: Math.round(totalHorasExtras * 100) / 100,
    totalDias,
    totalAusentes,
    totalRetardos,
    totalIncompletos
  };
}

function calcularResumenGeneral(empleados, rangoFechas) {
  let totalHorasTodas = 0;
  let totalHorasExtrasTodas = 0;
  let empleadosConAsistencia = 0;
  let totalRetardos = 0;
  let totalFaltas = 0;
  let totalJornadasCompletas = 0;
  let totalJornadasIncompletas = 0;

  for (const emp of empleados) {
    if (emp.totalDiasTrabajados > 0) {
      empleadosConAsistencia++;
    }
    totalHorasTodas += emp.totalHorasTrabajadas;
    totalHorasExtrasTodas += emp.totalHorasExtras || 0;
    totalRetardos += emp.totalRetardos;
    totalFaltas += emp.totalDiasAusente;

    for (const dia of emp.dias) {
      if (dia.jornadaCompleta) totalJornadasCompletas++;
      if (dia.incompleta) totalJornadasIncompletas++;
    }
  }

  return {
    periodo: `${rangoFechas.inicioStr} al ${rangoFechas.finStr}`,
    totalEmpleados: empleados.length,
    empleadosConAsistencia,
    empleadosSinAsistencia: empleados.length - empleadosConAsistencia,
    totalHorasTodas: Math.round(totalHorasTodas * 100) / 100,
    totalHorasExtrasTodas: Math.round(totalHorasExtrasTodas * 100) / 100,
    promedioHorasPorEmpleado: empleadosConAsistencia > 0
      ? Math.round((totalHorasTodas / empleadosConAsistencia) * 100) / 100
      : 0,
    totalRetardos,
    totalFaltas,
    totalJornadasCompletas,
    totalJornadasIncompletas,
    diasEnPeriodo: rangoFechas.totalDias
  };
}

// ============================================================
// MATCHING DE EMPLEADOS CON BASE DE DATOS
// ============================================================

/**
 * Empareja empleados del checador con empleados del sistema por nombre normalizado.
 * Retorna mapa de matching y lista de no matcheados.
 */
export async function emparejarEmpleados(empleadosChecador) {
  // Consultar empleados activos del sistema con su tipo de horario
  const empleadosDB = await prisma.empleados.findMany({
    where: { ID_Estatus: 1 },
    select: {
      ID_Empleado: true,
      Nombre: true,
      Apellido_Paterno: true,
      Apellido_Materno: true,
      ID_Tipo_Horario: true,
      tipo_horario: { select: { Nombre_Horario: true } }
    }
  });

  // Crear mapa de nombres normalizados → empleado DB
  const dbMap = new Map();
  for (const emp of empleadosDB) {
    const nombreCompleto = [emp.Nombre, emp.Apellido_Paterno, emp.Apellido_Materno].filter(Boolean).join(' ');
    const key = normalizarNombre(nombreCompleto);
    dbMap.set(key, emp);
  }

  const matching = [];
  const noMatcheados = [];

  for (const empChecador of empleadosChecador) {
    const key = normalizarNombre(empChecador.nombre);
    const empDB = dbMap.get(key);

    if (empDB) {
      const horario = empDB.tipo_horario?.Nombre_Horario || '';
      const esMixto = /mixto|mixta|h[ií]brido/i.test(horario);

      matching.push({
        idChecador: empChecador.idChecador,
        nombreChecador: empChecador.nombre,
        ID_Empleado: empDB.ID_Empleado,
        nombreDB: [empDB.Nombre, empDB.Apellido_Paterno, empDB.Apellido_Materno].filter(Boolean).join(' '),
        esMixto,
        horario
      });
    } else {
      noMatcheados.push({
        idChecador: empChecador.idChecador,
        nombre: empChecador.nombre
      });
    }
  }

  return { matching, noMatcheados, totalDB: empleadosDB.length };
}

// ============================================================
// PERSISTENCIA A BASE DE DATOS
// ============================================================

/**
 * Guarda los datos del checador en Empleados_Asistencia e Historial_Checadas.
 * Usa transacciones para atomicidad.
 */
export async function guardarEnBaseDatos(resultado, matchingData, userId) {
  const { empleados, rangoFechas } = resultado;
  const { matching } = matchingData;

  // Crear mapa idChecador → ID_Empleado
  const matchMap = new Map();
  for (const m of matching) {
    matchMap.set(m.idChecador, m);
  }

  let guardados = 0;
  let errores = [];
  let diasGuardados = 0;

  for (const emp of empleados) {
    const match = matchMap.get(emp.idChecador);
    if (!match) continue; // No matcheado, skip

    try {
      await prisma.$transaction(async (tx) => {
        for (const dia of emp.dias) {
          if (!dia.fecha) continue;

          const fechaDia = new Date(dia.fecha);
          fechaDia.setHours(0, 0, 0, 0);

          // Construir DateTime para entrada/salida
          let horaEntrada = null;
          let horaSalida = null;

          if (dia.entrada) {
            const [h, m] = dia.entrada.split(':').map(Number);
            horaEntrada = new Date(fechaDia);
            horaEntrada.setHours(h, m, 0, 0);
          }
          if (dia.salida) {
            const [h, m] = dia.salida.split(':').map(Number);
            horaSalida = new Date(fechaDia);
            horaSalida.setHours(h, m, 0, 0);
          }

          // Upsert asistencia (unique: ID_Empleado + Fecha)
          const asistencia = await tx.empleados_Asistencia.upsert({
            where: {
              ID_Empleado_Fecha: {
                ID_Empleado: match.ID_Empleado,
                Fecha: fechaDia
              }
            },
            update: {
              Hora_Entrada: horaEntrada,
              Hora_Salida: horaSalida,
              Horas_Trabajadas: dia.horasTrabajadas || 0,
              Horas_Extras: dia.horasExtras || 0,
              Minutos_Retardo: dia.minutosRetardo || 0,
              Retardo: dia.retardo || false,
              Presente: dia.presente || false,
              Ubicacion_Entrada: dia.ubicacion || null,
              Ubicacion_Salida: dia.ubicacion || null,
              Notas: dia.notas || '',
              UpdatedAt: new Date(),
              CreatedBy: userId
            },
            create: {
              ID_Empleado: match.ID_Empleado,
              Fecha: fechaDia,
              Hora_Entrada: horaEntrada,
              Hora_Salida: horaSalida,
              Horas_Trabajadas: dia.horasTrabajadas || 0,
              Horas_Extras: dia.horasExtras || 0,
              Minutos_Retardo: dia.minutosRetardo || 0,
              Retardo: dia.retardo || false,
              Presente: dia.presente || false,
              Ubicacion_Entrada: dia.ubicacion || null,
              Ubicacion_Salida: dia.ubicacion || null,
              Notas: dia.notas || '',
              CreatedBy: userId
            }
          });

          diasGuardados++;

          // Guardar checadas individuales en Historial_Checadas
          if (dia.checadas && dia.checadas.length > 0) {
            // Eliminar checadas anteriores para este registro
            await tx.historial_Checadas.deleteMany({
              where: { ID_Asistencia: asistencia.ID_Asistencia }
            });

            for (let idx = 0; idx < dia.checadas.length; idx++) {
              const checada = dia.checadas[idx];
              const fechaHora = new Date(fechaDia);
              fechaHora.setHours(checada.hora, checada.minuto, 0, 0);

              let tipoChecada = 'REGISTRO';
              if (idx === 0) tipoChecada = 'ENTRADA';
              else if (idx === dia.checadas.length - 1) tipoChecada = 'SALIDA';

              await tx.historial_Checadas.create({
                data: {
                  ID_Asistencia: asistencia.ID_Asistencia,
                  Tipo_Checada: tipoChecada,
                  Fecha_Hora: fechaHora,
                  Ubicacion: dia.ubicacion || null,
                  Estado: 'REGISTRADO'
                }
              });
            }
          }
        }
      });

      guardados++;
    } catch (err) {
      errores.push({ empleado: emp.nombre, error: err.message });
    }
  }

  return {
    guardados,
    diasGuardados,
    errores,
    noMatcheados: matchingData.noMatcheados.length,
    total: empleados.length
  };
}

/**
 * Calcula horas extras semanales para empleados mixtos.
 * Si presenciales > 15h → excedente = extras.
 * Si total > 45h → excedente sobre 45 = extras adicionales.
 */
export async function calcularExtrasMixtos(resultado, matchingData) {
  const { matching } = matchingData;
  const mixtos = matching.filter(m => m.esMixto);
  if (mixtos.length === 0) return [];

  const resultados = [];

  for (const mix of mixtos) {
    const emp = resultado.empleados.find(e => e.idChecador === mix.idChecador);
    if (!emp) continue;

    // Sumar horas presenciales de la semana
    let horasPresenciales = 0;
    for (const dia of emp.dias) {
      if (dia.presente && !dia.esSabado) {
        horasPresenciales += dia.horasNormales || 0;
      }
    }

    // Si presenciales > 15h, el excedente son extras
    let extrasPresenciales = 0;
    if (horasPresenciales > MIXTO_HORAS_PRESENCIALES_SEMANA) {
      extrasPresenciales = horasPresenciales - MIXTO_HORAS_PRESENCIALES_SEMANA;
    }

    // Si total (normales + extras existentes) > 45h, excedente adicional
    const totalSemana = emp.totalHorasTrabajadas;
    let extrasSobreCap = 0;
    if (totalSemana > MIXTO_HORAS_TOTALES_SEMANA) {
      extrasSobreCap = totalSemana - MIXTO_HORAS_TOTALES_SEMANA;
    }

    const totalExtrasAdicionales = Math.max(extrasPresenciales, extrasSobreCap);

    resultados.push({
      ID_Empleado: mix.ID_Empleado,
      nombre: mix.nombreDB,
      horasPresenciales: Math.round(horasPresenciales * 100) / 100,
      extrasPresenciales: Math.round(extrasPresenciales * 100) / 100,
      extrasSobreCap: Math.round(extrasSobreCap * 100) / 100,
      totalExtrasAdicionales: Math.round(totalExtrasAdicionales * 100) / 100
    });
  }

  return resultados;
}

// ============================================================
// UTILIDADES
// ============================================================

export function normalizarNombre(nombre) {
  return (nombre || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function minutosAHora(totalMinutos) {
  const h = Math.floor(totalMinutos / 60);
  const m = totalMinutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatearHoras(horas) {
  const h = Math.floor(horas);
  const m = Math.round((horas - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default {
  parsearArchivoChecador,
  combinarChecadores,
  emparejarEmpleados,
  guardarEnBaseDatos,
  calcularExtrasMixtos,
  formatearHoras,
  normalizarNombre
};
