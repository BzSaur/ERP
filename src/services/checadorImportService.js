/**
 * Servicio de Importación de Checadores - RAM
 * 
 * Parsea archivos XLSX exportados de los checadores biométricos (RAM1/RAM2)
 * y calcula automáticamente las horas trabajadas por empleado por día,
 * restando la hora de comida (14:00-15:00).
 * 
 * Formato del XLSX del checador:
 * - Fila 0: Título "Registros de asistencia"
 * - Fila 1: Rango de fechas "YYYY-MM-DD ~ YYYY-MM-DD"
 * - Por cada empleado (bloques de 4 filas):
 *   - Fila ID: "ID." | _ | número | ... | "Nombre" | _ | nombre_empleado | ... | "Depart." | _ | departamento
 *   - Fila días: números de día del mes (ej: 13, 14, 15, 16, 17, 18, 19, 20)
 *   - Fila nombres: nombres de día (Jue, Vie, Sáb, Dom, Lun, Mar, Mié, Jue)
 *   - Fila checadas: tiempos separados por \n (ej: "08:00\n17:07")
 */

import * as XLSX from 'xlsx';

// ============================================================
// CONFIGURACIÓN DE HORARIO DE COMIDA
// ============================================================

const COMIDA_INICIO_DEFAULT = 14 * 60;       // 14:00 en minutos
const COMIDA_FIN_DEFAULT = 15 * 60;           // 15:00 en minutos
const DURACION_COMIDA_MINUTOS = 60;           // 1 hora

const HORA_ENTRADA_ESTANDAR = 8 * 60;        // 08:00
const HORA_SALIDA_ESTANDAR = 17 * 60;        // 17:00
const JORNADA_COMPLETA_HORAS = 8;             // 8 horas efectivas (sin comida)

// ============================================================
// PARSER PRINCIPAL DEL XLSX
// ============================================================

/**
 * Parsea un archivo XLSX del checador biométrico
 * @param {Buffer} fileBuffer - Buffer del archivo XLSX
 * @param {string} ubicacion - Ubicación del checador: 'RAM1' o 'RAM2'
 * @param {Object} opciones - Opciones de configuración
 * @returns {Object} Datos parseados con empleados y checadas
 */
export function parsearArchivoChecador(fileBuffer, ubicacion = 'RAM1', opciones = {}) {
  const {
    comidaInicio = COMIDA_INICIO_DEFAULT,
    comidaFin = COMIDA_FIN_DEFAULT,
  } = opciones;

  // Leer el archivo XLSX
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convertir a array de arrays
  const datos = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (datos.length < 3) {
    throw new Error('El archivo no tiene el formato esperado del checador');
  }

  // Extraer rango de fechas de la fila 1
  const rangoFechas = extraerRangoFechas(datos);

  // Parsear empleados
  const empleados = parsearEmpleados(datos, rangoFechas, ubicacion, { comidaInicio, comidaFin });

  // Calcular resumen general
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
 * @param {Object} datosRAM1 - Datos parseados de RAM1 (puede ser null)
 * @param {Object} datosRAM2 - Datos parseados de RAM2 (puede ser null)
 * @returns {Object} Datos combinados
 */
export function combinarChecadores(datosRAM1, datosRAM2) {
  // Si solo hay uno, regresar ese
  if (!datosRAM1 && !datosRAM2) {
    throw new Error('Se requiere al menos un archivo de checador');
  }
  if (!datosRAM1) return { ...datosRAM2, ubicacion: 'RAM2' };
  if (!datosRAM2) return { ...datosRAM1, ubicacion: 'RAM1' };

  // Validar que los rangos de fechas coincidan
  const rango1 = datosRAM1.rangoFechas;
  const rango2 = datosRAM2.rangoFechas;

  if (rango1.inicioStr !== rango2.inicioStr || rango1.finStr !== rango2.finStr) {
    console.warn('⚠️ Los rangos de fechas de RAM1 y RAM2 no coinciden. Se usará la unión de ambos rangos.');
  }

  // Crear mapa de empleados combinados por nombre (normalizado)
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
      // Empleado ya existe en RAM1, combinar checadas
      const existente = empleadosMap.get(key);
      existente.ubicaciones.push('RAM2');
      existente.diasPorUbicacion.RAM2 = emp.dias;

      // Combinar días
      existente.dias = combinarDiasEmpleado(existente.diasPorUbicacion.RAM1, emp.dias);

      // Recalcular totales
      const totales = recalcularTotales(existente.dias);
      existente.totalHorasTrabajadas = totales.totalHoras;
      existente.totalDiasTrabajados = totales.totalDias;
      existente.totalDiasAusente = totales.totalAusentes;
      existente.totalRetardos = totales.totalRetardos;
    } else {
      // Empleado solo en RAM2
      empleadosMap.set(key, {
        ...emp,
        ubicaciones: ['RAM2'],
        diasPorUbicacion: { RAM1: [], RAM2: emp.dias }
      });
    }
  }

  const empleadosCombinados = Array.from(empleadosMap.values());
  const rangoFechas = datosRAM1.rangoFechas; // Usar rango de RAM1 como base

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
// FUNCIONES INTERNAS DE PARSEO
// ============================================================

/**
 * Extrae el rango de fechas del archivo
 */
function extraerRangoFechas(datos) {
  // Buscar la celda con el rango de fechas (fila 1, columna 2)
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

  // Generar array de fechas en el rango
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

/**
 * Parsea todos los empleados del archivo
 */
function parsearEmpleados(datos, rangoFechas, ubicacion, opciones) {
  const empleados = [];

  for (let i = 0; i < datos.length; i++) {
    const fila = datos[i] || [];

    // Detectar fila de ID de empleado
    if (String(fila[0]).trim() === 'ID.') {
      const idChecador = parseInt(String(fila[2]).trim(), 10);
      
      // El nombre puede estar en la columna 11 o buscar después de "Nombre"
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

      // Las siguientes 3 filas son: días numéricos, nombres de día, checadas
      const filaDias = datos[i + 1] || [];
      const filaNombresDia = datos[i + 2] || [];
      const filaChecadas = datos[i + 3] || [];

      // Parsear días con checadas
      const dias = parsearDiasEmpleado(filaDias, filaNombresDia, filaChecadas, rangoFechas, ubicacion, opciones);

      // Calcular totales
      const totales = recalcularTotales(dias);

      empleados.push({
        idChecador,
        nombre,
        departamento,
        ubicacion,
        dias,
        totalHorasTrabajadas: totales.totalHoras,
        totalDiasTrabajados: totales.totalDias,
        totalDiasAusente: totales.totalAusentes,
        totalRetardos: totales.totalRetardos,
        totalDiasIncompletos: totales.totalIncompletos
      });

      i += 3; // Saltar las filas ya procesadas
    }
  }

  return empleados;
}

/**
 * Parsea los días de un empleado y calcula horas
 */
function parsearDiasEmpleado(filaDias, filaNombresDia, filaChecadas, rangoFechas, ubicacion, opciones) {
  const dias = [];
  const numColumnas = Math.min(filaDias.length, rangoFechas.totalDias);

  for (let col = 0; col < numColumnas; col++) {
    const diaNum = parseInt(String(filaDias[col]).trim(), 10);
    const nombreDia = String(filaNombresDia[col] || '').trim();
    const checadasStr = String(filaChecadas[col] || '').trim();

    if (isNaN(diaNum)) continue;

    // Construir la fecha completa
    const fecha = rangoFechas.fechas[col] || null;

    // Parsear las checadas del día
    const checadas = parsearChecadasDia(checadasStr);

    // Calcular horas trabajadas
    const calculo = calcularHorasDia(checadas, opciones);

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

/**
 * Parsea las checadas de un día (string con \n separando múltiples)
 */
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

/**
 * Calcula las horas trabajadas en un día basándose en las checadas
 * Agrupa checadas en pares (entrada/salida) y resta hora de comida
 */
function calcularHorasDia(checadas, opciones = {}) {
  const { comidaInicio = COMIDA_INICIO_DEFAULT, comidaFin = COMIDA_FIN_DEFAULT } = opciones;
  const duracionComida = comidaFin - comidaInicio;

  // Sin checadas = ausente
  if (!checadas || checadas.length === 0) {
    return {
      presente: false,
      entrada: null,
      salida: null,
      horasTrabajadas: 0,
      horasTrabajadasBruto: 0,
      minutosComidaDescontados: 0,
      minutosRetardo: 0,
      retardo: false,
      jornadaCompleta: false,
      incompleta: false,
      notas: 'Sin checada'
    };
  }

  // Solo una checada = incompleta (solo entrada)
  if (checadas.length === 1) {
    const entrada = checadas[0];
    const minutosRetardo = Math.max(0, entrada.totalMinutos - HORA_ENTRADA_ESTANDAR);

    return {
      presente: true,
      entrada: entrada.horaStr,
      salida: null,
      horasTrabajadas: 0,
      horasTrabajadasBruto: 0,
      minutosComidaDescontados: 0,
      minutosRetardo: minutosRetardo > 15 ? minutosRetardo : 0,
      retardo: minutosRetardo > 15,
      jornadaCompleta: false,
      incompleta: true,
      notas: 'Solo entrada registrada, falta salida'
    };
  }

  // Múltiples checadas: agrupar en pares (entrada/salida)
  const entrada = checadas[0];
  const salida = checadas[checadas.length - 1];

  // Calcular minutos brutos trabajados (de primera checada a última)
  const minutosBrutos = salida.totalMinutos - entrada.totalMinutos;

  // Determinar si se debe descontar la hora de comida
  // Se descuenta si la jornada cruza el horario de comida (14:00-15:00)
  let minutosComidaDescontados = 0;
  if (entrada.totalMinutos < comidaFin && salida.totalMinutos > comidaInicio) {
    // La jornada cruza el horario de comida
    const inicioOverlap = Math.max(entrada.totalMinutos, comidaInicio);
    const finOverlap = Math.min(salida.totalMinutos, comidaFin);
    minutosComidaDescontados = Math.max(0, finOverlap - inicioOverlap);
  }

  // Minutos netos trabajados
  const minutosNetos = Math.max(0, minutosBrutos - minutosComidaDescontados);
  const horasTrabajadas = Math.round((minutosNetos / 60) * 100) / 100;
  const horasTrabajadasBruto = Math.round((minutosBrutos / 60) * 100) / 100;

  // Evaluar retardo (más de 15 min después de las 8:00)
  const minutosRetardo = Math.max(0, entrada.totalMinutos - HORA_ENTRADA_ESTANDAR);
  const retardo = minutosRetardo > 15;

  // ¿Jornada completa? (8+ horas efectivas)
  const jornadaCompleta = horasTrabajadas >= JORNADA_COMPLETA_HORAS;

  // Notas automáticas
  const notas = generarNotasDia(entrada, salida, checadas, horasTrabajadas, retardo, minutosRetardo);

  return {
    presente: true,
    entrada: entrada.horaStr,
    salida: salida.horaStr,
    horasTrabajadas,
    horasTrabajadasBruto,
    minutosComidaDescontados,
    minutosRetardo: retardo ? minutosRetardo : 0,
    retardo,
    jornadaCompleta,
    incompleta: false,
    totalChecadas: checadas.length,
    checadasIntermedias: checadas.length > 2 
      ? checadas.slice(1, -1).map(c => c.horaStr) 
      : [],
    notas
  };
}

/**
 * Genera notas automáticas sobre el día
 */
function generarNotasDia(entrada, salida, checadas, horasTrabajadas, retardo, minutosRetardo) {
  const notas = [];

  if (retardo) {
    notas.push(`Retardo de ${minutosRetardo} min`);
  }

  if (salida.totalMinutos < HORA_SALIDA_ESTANDAR) {
    const minAntes = HORA_SALIDA_ESTANDAR - salida.totalMinutos;
    if (minAntes > 5) {
      notas.push(`Salida ${minAntes} min antes`);
    }
  }

  if (checadas.length > 2) {
    notas.push(`${checadas.length} checadas registradas`);
  }

  if (horasTrabajadas >= JORNADA_COMPLETA_HORAS) {
    notas.push('Jornada completa');
  } else if (horasTrabajadas > 0) {
    const faltantes = JORNADA_COMPLETA_HORAS - horasTrabajadas;
    notas.push(`Faltan ${faltantes.toFixed(1)}h para jornada completa`);
  }

  return notas.join(' | ');
}

// ============================================================
// FUNCIONES DE COMBINACIÓN
// ============================================================

/**
 * Combina los días de un empleado de dos checadores
 */
function combinarDiasEmpleado(diasRAM1, diasRAM2) {
  const diasMap = new Map();

  // Indexar días de RAM1
  for (const dia of diasRAM1) {
    const key = dia.diaNum;
    diasMap.set(key, { ...dia });
  }

  // Combinar con RAM2
  for (const dia of diasRAM2) {
    const key = dia.diaNum;
    if (diasMap.has(key)) {
      const existente = diasMap.get(key);
      
      // Si el existente no tiene checadas pero RAM2 sí, usar RAM2
      if (!existente.presente && dia.presente) {
        diasMap.set(key, { ...dia, ubicacion: 'RAM2' });
      } else if (existente.presente && dia.presente) {
        // Ambos tienen checadas, combinar (tomar la mayor cantidad de horas)
        if (dia.horasTrabajadas > existente.horasTrabajadas) {
          diasMap.set(key, { ...dia, ubicacion: 'RAM1+RAM2', notas: `Checada en ambos checadores. ${dia.notas}` });
        } else {
          existente.ubicacion = 'RAM1+RAM2';
          existente.notas = `Checada en ambos checadores. ${existente.notas}`;
        }
      }
    } else {
      diasMap.set(key, { ...dia, ubicacion: 'RAM2' });
    }
  }

  return Array.from(diasMap.values()).sort((a, b) => a.diaNum - b.diaNum);
}

// ============================================================
// FUNCIONES DE CÁLCULO DE RESÚMENES
// ============================================================

/**
 * Recalcula los totales de un empleado
 */
function recalcularTotales(dias) {
  let totalHoras = 0;
  let totalDias = 0;
  let totalAusentes = 0;
  let totalRetardos = 0;
  let totalIncompletos = 0;

  for (const dia of dias) {
    if (dia.presente) {
      totalDias++;
      totalHoras += dia.horasTrabajadas || 0;
      if (dia.retardo) totalRetardos++;
      if (dia.incompleta) totalIncompletos++;
    } else {
      // Solo contar como ausente si no es domingo
      const esDomingo = dia.nombreDia && dia.nombreDia.toLowerCase().startsWith('dom');
      if (!esDomingo) {
        totalAusentes++;
      }
    }
  }

  return {
    totalHoras: Math.round(totalHoras * 100) / 100,
    totalDias,
    totalAusentes,
    totalRetardos,
    totalIncompletos
  };
}

/**
 * Calcula el resumen general de todos los empleados
 */
function calcularResumenGeneral(empleados, rangoFechas) {
  let totalHorasTodas = 0;
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
// UTILIDADES
// ============================================================

/**
 * Normaliza un nombre para comparación
 */
function normalizarNombre(nombre) {
  return (nombre || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^A-Z\s]/g, '')        // Solo letras y espacios
    .replace(/\s+/g, ' ')            // Normalizar espacios
    .trim();
}

/**
 * Formatea minutos a formato "Xh Ym"
 */
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
  formatearHoras
};
