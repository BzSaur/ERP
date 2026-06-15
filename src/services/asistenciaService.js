/**
 * Servicio de Asistencia - RAM
 * Manejo de checadas biométricas desde RAM1 y RAM2
 * 
 * Configuración:
 * - Entrada: 8:00 hrs
 * - Salida: 17:00 hrs
 * - Tolerancia: 15 minutos
 * - Comida: 14:00-15:00 (sin goce de sueldo)
 */

import prisma from '../config/database.js';
import { getConfig, getConfigMultiple } from './nominaService.js';
import { calcularHorasPorPares, minutosAHora } from './checadorImportService.js';
import { horaLocalDevice } from '../utils/tiempo.js';

// ============================================================
// CONSTANTES Y CONFIGURACIÓN
// ============================================================

const UBICACIONES = {
  RAM1: 'RAM1',
  RAM2: 'RAM2'
};

// ============================================================
// REGISTRO DE ASISTENCIA
// ============================================================

/**
 * Registra una checada desde el sistema biométrico
 * Nota: Solo ENTRADA y SALIDA (la comida es dentro de la empresa)
 */
export async function registrarChecada({
  empleadoId,
  tipoChecada, // 'ENTRADA' | 'SALIDA'
  ubicacion,   // 'RAM1' | 'RAM2'
  fechaHora = new Date(),
  dispositivo = null
}) {
  const config = await getConfigMultiple([
    'HORA_ENTRADA',
    'HORA_SALIDA',
    'TOLERANCIA_MINUTOS',
    'HORA_COMIDA_INICIO',
    'HORA_COMIDA_FIN'
  ]);

  // Verificar que el empleado existe y está activo
  const empleado = await prisma.empleados.findUnique({
    where: { ID_Empleado: empleadoId },
    include: {
      estatus: true,
      area: true
    }
  });

  if (!empleado) {
    throw new Error('Empleado no encontrado');
  }

  if (empleado.estatus?.Nombre_Estatus !== 'ACTIVO') {
    throw new Error('El empleado no está activo');
  }

  // Obtener la fecha sin hora para buscar el registro del día
  const fechaSolo = new Date(fechaHora);
  fechaSolo.setHours(0, 0, 0, 0);
  
  const fechaFinDia = new Date(fechaSolo);
  fechaFinDia.setHours(23, 59, 59, 999);

  // Buscar o crear registro de asistencia del día
  let asistencia = await prisma.empleados_Asistencia.findFirst({
    where: {
      ID_Empleado: empleadoId,
      Fecha: {
        gte: fechaSolo,
        lte: fechaFinDia
      }
    }
  });

  // Calcular estado de la checada
  const estadoChecada = evaluarEstadoChecada(tipoChecada, fechaHora, config);

  // Datos a actualizar según el tipo de checada
  const datosActualizacion = {};

  switch (tipoChecada) {
    case 'ENTRADA':
      datosActualizacion.Hora_Entrada = fechaHora;
      datosActualizacion.Presente = true;
      datosActualizacion.Ubicacion_Entrada = ubicacion;
      if (estadoChecada.retardo) {
        const esSistemas = /sistemas/i.test(empleado.area?.Nombre_Area || '');
        const minutos = estadoChecada.minutosRetardo;
        if (esSistemas && minutos >= 15 && minutos <= 25) {
        } else {
          datosActualizacion.Retardo = true;
          datosActualizacion.Minutos_Retardo = minutos;
        }
      }
      break;
      
    case 'SALIDA':
      datosActualizacion.Hora_Salida = fechaHora;
      datosActualizacion.Ubicacion_Salida = ubicacion;
      break;
  }

  if (asistencia) {
    // Actualizar registro existente
    asistencia = await prisma.empleados_Asistencia.update({
      where: { ID_Asistencia: asistencia.ID_Asistencia },
      data: datosActualizacion
    });
  } else {
    // Crear nuevo registro
    asistencia = await prisma.empleados_Asistencia.create({
      data: {
        ID_Empleado: empleadoId,
        Fecha: fechaSolo,
        ...datosActualizacion
      }
    });
  }

  // Registrar en historial de checadas
  await prisma.historial_Checadas.create({
    data: {
      ID_Asistencia: asistencia.ID_Asistencia,
      Tipo_Checada: tipoChecada,
      Fecha_Hora: fechaHora,
      Ubicacion: ubicacion,
      Dispositivo: dispositivo,
      Estado: estadoChecada.estado
    }
  });

  return {
    asistencia,
    checada: {
      tipo: tipoChecada,
      ubicacion,
      fechaHora,
      estado: estadoChecada
    },
    empleado: {
      id: empleado.ID_Empleado,
      nombre: `${empleado.Nombre} ${empleado.Apellido_Paterno}`
    }
  };
}

/**
 * Evalúa el estado de una checada (a tiempo, retardo, etc.)
 */
function evaluarEstadoChecada(tipoChecada, fechaHora, config) {
  const hora = fechaHora.getHours();
  const minutos = fechaHora.getMinutes();
  const totalMinutos = hora * 60 + minutos;
  
  // Parsear hora de entrada configurada (formato "HH:MM")
  const horaEntrada = config.HORA_ENTRADA || '08:00';
  const [horaEnt, minEnt] = horaEntrada.split(':').map(Number);
  const minutosEntrada = horaEnt * 60 + minEnt;
  
  const tolerancia = config.TOLERANCIA_MINUTOS || 15;
  const limiteTolerancia = minutosEntrada + tolerancia;

  const resultado = {
    estado: 'A_TIEMPO',
    retardo: false,
    minutosRetardo: 0,
    mensaje: ''
  };

  if (tipoChecada === 'ENTRADA') {
    if (totalMinutos <= minutosEntrada) {
      resultado.estado = 'A_TIEMPO';
      resultado.mensaje = 'Entrada a tiempo';
    } else if (totalMinutos <= limiteTolerancia) {
      resultado.estado = 'TOLERANCIA';
      resultado.mensaje = 'Entrada dentro de tolerancia';
    } else {
      resultado.estado = 'RETARDO';
      resultado.retardo = true;
      resultado.minutosRetardo = totalMinutos - minutosEntrada;
      resultado.mensaje = `Retardo de ${resultado.minutosRetardo} minutos`;
    }
  } else if (tipoChecada === 'SALIDA') {
    // Parsear hora de salida configurada
    const horaSalida = config.HORA_SALIDA || '17:00';
    const [horaSal, minSal] = horaSalida.split(':').map(Number);
    const minutosSalida = horaSal * 60 + minSal;
    
    if (totalMinutos >= minutosSalida) {
      resultado.estado = 'COMPLETO';
      resultado.mensaje = 'Jornada completa';
    } else {
      resultado.estado = 'SALIDA_TEMPRANA';
      resultado.mensaje = `Salida ${minutosSalida - totalMinutos} minutos antes`;
    }
  }

  return resultado;
}

// ============================================================
// CONSULTAS DE ASISTENCIA
// ============================================================

/**
 * Calcula las horas de un día a partir de las checadas reales de Historial_Checadas,
 * usando la MISMA lógica que el import de checador y el push ADMS
 * (calcularHorasDia: comida condicional 14-15, tolerancia 15min, extras >18:00,
 * sábados, RAM1+RAM2 consolidado por ser todas las checadas del día).
 *
 * Fuente única de verdad para el cálculo de horas en todo el sistema.
 *
 * @param {Array} checadasHistorial - filas de Historial_Checadas del día (con Fecha_Hora)
 * @param {Date} fecha - fecha del día (para detectar sábado)
 * @returns resultado de calcularHorasDia
 */
export function calcularHorasDesdeChecadas(checadasHistorial, fecha) {
  const checadas = (checadasHistorial || [])
    .map(c => {
      const d = new Date(c.Fecha_Hora);
      const h = d.getHours();
      const m = d.getMinutes();
      return { hora: h, minuto: m, totalMinutos: h * 60 + m, horaStr: minutosAHora(h * 60 + m) };
    })
    .sort((a, b) => a.totalMinutos - b.totalMinutos);

  const esSabado = new Date(fecha).getDay() === 6;
  return calcularHorasPorPares(checadas, { esSabado });
}

/**
 * Obtiene el resumen de asistencia de un empleado para un período
 */
export async function obtenerResumenAsistencia({
  empleadoId,
  fechaInicio,
  fechaFin
}) {
  const asistencias = await prisma.empleados_Asistencia.findMany({
    where: {
      ID_Empleado: empleadoId,
      Fecha: {
        gte: fechaInicio,
        lte: fechaFin
      }
    },
    orderBy: { Fecha: 'asc' }
  });

  const resumen = {
    periodo: { fechaInicio, fechaFin },
    totalDias: asistencias.length,
    diasPresentes: 0,
    diasAusentes: 0,
    retardos: 0,
    minutosRetardoTotal: 0,
    horasTrabajadas: 0,
    checadasCompletas: 0, // Días con entrada Y salida
    porUbicacion: {
      RAM1: { entradas: 0, salidas: 0 },
      RAM2: { entradas: 0, salidas: 0 }
    },
    detalle: []
  };

  for (const asistencia of asistencias) {
    if (asistencia.Presente) {
      resumen.diasPresentes++;
      
      if (asistencia.Retardo) {
        resumen.retardos++;
        resumen.minutosRetardoTotal += asistencia.Minutos_Retardo || 0;
      }
      
      // Verificar checada completa
      if (asistencia.Hora_Entrada && asistencia.Hora_Salida) {
        resumen.checadasCompletas++;
      }

      // Horas trabajadas: usar el campo ya calculado (import XLSX / ADMS usan
      // calcularHorasDia: comida condicional, no -1h fija). Fuente única de verdad.
      resumen.horasTrabajadas += Number(asistencia.Horas_Trabajadas) || 0;
      
      // Contar por ubicación
      if (asistencia.Ubicacion_Entrada) {
        resumen.porUbicacion[asistencia.Ubicacion_Entrada] = 
          resumen.porUbicacion[asistencia.Ubicacion_Entrada] || { entradas: 0, salidas: 0 };
        resumen.porUbicacion[asistencia.Ubicacion_Entrada].entradas++;
      }
      if (asistencia.Ubicacion_Salida) {
        resumen.porUbicacion[asistencia.Ubicacion_Salida] = 
          resumen.porUbicacion[asistencia.Ubicacion_Salida] || { entradas: 0, salidas: 0 };
        resumen.porUbicacion[asistencia.Ubicacion_Salida].salidas++;
      }
    } else {
      resumen.diasAusentes++;
    }
    
    resumen.detalle.push({
      fecha: asistencia.Fecha,
      presente: asistencia.Presente,
      entrada: asistencia.Hora_Entrada,
      salida: asistencia.Hora_Salida,
      retardo: asistencia.Retardo,
      minutosRetardo: asistencia.Minutos_Retardo,
      ubicacionEntrada: asistencia.Ubicacion_Entrada,
      ubicacionSalida: asistencia.Ubicacion_Salida
    });
  }

  resumen.horasTrabajadas = Math.round(resumen.horasTrabajadas * 100) / 100;

  return resumen;
}

/**
 * Desglose de horas por día y total semanal de un empleado, con detalle de
 * checadas (entrada/salida, ubicación por planta, multi-planta). Mismo cálculo
 * que el import de checador, pero leyendo de la BD (checadas reales ADMS/XLSX).
 *
 * @param {number} empleadoId
 * @param {Date} fechaInicio - lunes de la semana (o inicio de rango)
 * @param {Date} fechaFin - sábado/domingo (o fin de rango)
 */
export async function obtenerDesgloseHoras(empleadoId, fechaInicio, fechaFin) {
  const inicio = new Date(fechaInicio); inicio.setHours(0, 0, 0, 0);
  const fin = new Date(fechaFin); fin.setHours(23, 59, 59, 999);

  const [asistencias, empleado] = await Promise.all([
    prisma.empleados_Asistencia.findMany({
      where: { ID_Empleado: empleadoId, Fecha: { gte: inicio, lte: fin } },
      orderBy: { Fecha: 'asc' },
      include: {
        historial_checadas: {
          orderBy: { Fecha_Hora: 'asc' },
          include: { checador: { select: { Nombre: true, planta: { select: { Nombre: true } } } } }
        }
      }
    }),
    prisma.empleados.findUnique({
      where: { ID_Empleado: empleadoId },
      select: { tipo_horario: { select: { Horas_Jornada: true, Dias_Semana: true, Horas_Semana: true } } }
    })
  ]);

  const NOMBRES_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const dias = [];
  let totalHoras = 0, totalNormales = 0, totalExtras = 0;
  let diasTrabajados = 0, diasRetardo = 0, diasMultiPlanta = 0;
  let minutosRetardoTotal = 0;
  const horasPorPlanta = new Map(); // planta -> horas

  for (const a of asistencias) {
    const fecha = new Date(a.Fecha);
    const checadas = a.historial_checadas || [];
    const calc = calcularHorasDesdeChecadas(checadas, fecha);

    // Preferir horas recalculadas desde checadas (cubre registros con 0h guardados)
    const horasBD = Number(a.Horas_Trabajadas) || 0;
    const horas = (checadas.length > 0 && calc.horasTrabajadas > 0) ? calc.horasTrabajadas : horasBD;
    const extras = (checadas.length > 0 && calc.horasExtras != null) ? (calc.horasExtras || 0) : (Number(a.Horas_Extras) || 0);
    if (a.Presente && horas > 0) diasTrabajados++;
    if (a.Retardo) { diasRetardo++; minutosRetardoTotal += a.Minutos_Retardo || 0; }
    if (a.Multi_Planta) diasMultiPlanta++;
    totalHoras += horas;
    totalExtras += extras;
    totalNormales += Math.max(0, horas - extras);

    // Horas por planta (ubicación de entrada como planta del día)
    const plantaDia = a.Ubicacion_Entrada || a.Ubicacion_Salida;
    if (plantaDia && horas > 0) {
      horasPorPlanta.set(plantaDia, (horasPorPlanta.get(plantaDia) || 0) + horas);
    }

    dias.push({
      fecha,
      nombreDia: NOMBRES_DIA[fecha.getDay()],
      presente: a.Presente,
      entrada: a.Hora_Entrada ? new Date(a.Hora_Entrada) : null,
      salida: a.Hora_Salida ? new Date(a.Hora_Salida) : null,
      horas, extras,
      normales: Math.max(0, horas - extras),
      retardo: a.Retardo,
      minutosRetardo: a.Minutos_Retardo || 0,
      multiPlanta: a.Multi_Planta,
      ubicacionEntrada: a.Ubicacion_Entrada,
      ubicacionSalida: a.Ubicacion_Salida,
      minutosComida: calc.minutosComidaDescontados || 0,
      totalChecadas: checadas.length,
      incompleta: calc.incompleta || false,
      // Pares entrada-salida (uno por periodo presente). Si sale a clases y regresa,
      // hay >1 par. Cada checada con su planta.
      pares: (calc.pares || []).map(p => ({ entrada: p.entrada, salida: p.salida })),
      checadas: checadas.map(c => ({
        hora: new Date(c.Fecha_Hora),
        tipo: c.Tipo_Checada,
        planta: c.checador?.planta?.Nombre || c.Ubicacion,
        origen: c.Origen_Sincronizacion
      })),
      notas: calc.notas || (a.Notas || '')
    });
  }

  // ---- KPIs ----
  const limiteSemana = empleado?.tipo_horario?.Horas_Semana
    || (empleado?.tipo_horario?.Horas_Jornada || 8) * (empleado?.tipo_horario?.Dias_Semana || 6);
  const horasRedondeadas = Math.round(totalHoras * 100) / 100;
  // Horas extra reales = lo que excede el límite semanal del horario (ej. >45)
  const extrasSobreLimite = Math.max(0, Math.round((horasRedondeadas - limiteSemana) * 100) / 100);
  // Días laborables del rango (L-S, sin domingos)
  let diasLaborables = 0;
  for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0) diasLaborables++;
  }
  const frecuenciaAsistencia = diasLaborables > 0
    ? Math.round((diasTrabajados / diasLaborables) * 100) : 0;
  const promedioHorasDia = diasTrabajados > 0
    ? Math.round((horasRedondeadas / diasTrabajados) * 100) / 100 : 0;

  const plantas = Array.from(horasPorPlanta.entries())
    .map(([nombre, h]) => ({ nombre, horas: Math.round(h * 100) / 100 }))
    .sort((a, b) => b.horas - a.horas);

  return {
    periodo: { fechaInicio: inicio, fechaFin: fin },
    dias,
    totales: {
      horas: horasRedondeadas,
      normales: Math.round(totalNormales * 100) / 100,
      extras: Math.round(totalExtras * 100) / 100,
      diasTrabajados, diasRetardo, diasMultiPlanta
    },
    kpis: {
      limiteSemana,
      extrasSobreLimite,
      minutosRetardoTotal,
      diasRetardo,
      diasLaborables,
      frecuenciaAsistencia,   // % de días laborables con asistencia
      promedioHorasDia,
      diasMultiPlanta,
      cumpleHoras: horasRedondeadas >= limiteSemana,
      faltantes: Math.max(0, Math.round((limiteSemana - horasRedondeadas) * 100) / 100)
    },
    plantas
  };
}

/**
 * Tabla global: horas de la semana de TODOS los empleados activos.
 * Una fila por empleado con totales (normales, extras, total, días, retardos).
 *
 * @param {Date} fechaInicio
 * @param {Date} fechaFin
 */
export async function obtenerHorasSemanalTodos(fechaInicio, fechaFin) {
  const inicio = new Date(fechaInicio); inicio.setHours(0, 0, 0, 0);
  const fin = new Date(fechaFin); fin.setHours(23, 59, 59, 999);

  const empleados = await prisma.empleados.findMany({
    where: { ID_Estatus: 1 },
    select: {
      ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true,
      area: { select: { Nombre_Area: true } },
      puesto: { select: { Nombre_Puesto: true } },
      tipo_horario: { select: { Horas_Jornada: true, Dias_Semana: true } }
    },
    orderBy: [{ Apellido_Paterno: 'asc' }, { Nombre: 'asc' }]
  });

  // Todas las asistencias del rango, agrupadas en memoria por empleado
  const asistencias = await prisma.empleados_Asistencia.findMany({
    where: { Fecha: { gte: inicio, lte: fin } },
    select: {
      ID_Empleado: true, Fecha: true, Presente: true, Retardo: true, Multi_Planta: true,
      Hora_Entrada: true, Hora_Salida: true, Minutos_Retardo: true,
      Horas_Trabajadas: true, Horas_Extras: true,
      Ubicacion_Entrada: true, Ubicacion_Salida: true
    }
  });

  // Lista de fechas del rango (para la matriz)
  const fechas = [];
  for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    const f = new Date(d); f.setHours(0, 0, 0, 0);
    fechas.push(f);
  }

  const porEmpleado = new Map();
  const porPlanta = new Map();   // planta -> { horas, dias }
  const diasEmp = new Map();     // ID_Empleado -> (yyyy-mm-dd -> celda)
  for (const a of asistencias) {
    const acc = porEmpleado.get(a.ID_Empleado) || { horas: 0, extras: 0, dias: 0, retardos: 0, multi: 0 };
    const h = Number(a.Horas_Trabajadas) || 0;
    if (a.Presente && h > 0) acc.dias++;
    if (a.Retardo) acc.retardos++;
    if (a.Multi_Planta) acc.multi++;
    acc.horas += h;
    acc.extras += Number(a.Horas_Extras) || 0;
    porEmpleado.set(a.ID_Empleado, acc);

    const planta = a.Ubicacion_Entrada || a.Ubicacion_Salida;
    if (planta && h > 0) {
      const p = porPlanta.get(planta) || { horas: 0, dias: 0 };
      p.horas += h;
      p.dias++;
      porPlanta.set(planta, p);
    }

    // Celda de matriz
    const key = new Date(a.Fecha).toISOString().slice(0, 10);
    if (!diasEmp.has(a.ID_Empleado)) diasEmp.set(a.ID_Empleado, new Map());
    const entrada = a.Hora_Entrada ? new Date(a.Hora_Entrada) : null;
    const salida = a.Hora_Salida ? new Date(a.Hora_Salida) : null;
    const fmt = d => d ? String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0') : null;
    const incompleta = a.Presente && (!entrada || !salida);
    // Si sin salida y sin horas guardadas, estimar hasta 18:00
    let horasCelda = h;
    if (incompleta && h === 0 && entrada) {
      const entMin = entrada.getHours() * 60 + entrada.getMinutes();
      const CIERRE = 18 * 60;
      const COMIDA_INI = 14 * 60, COMIDA_FIN = 15 * 60;
      let netos = Math.max(0, CIERRE - entMin);
      if (entMin < COMIDA_FIN) netos -= Math.max(0, Math.min(CIERRE, COMIDA_FIN) - Math.max(entMin, COMIDA_INI));
      horasCelda = Math.round((netos / 60) * 100) / 100;
    }
    diasEmp.get(a.ID_Empleado).set(key, {
      presente: a.Presente,
      horas: horasCelda,
      extras: Number(a.Horas_Extras) || 0,
      entrada: fmt(entrada),
      salida: fmt(salida),
      incompleta,
      retardo: a.Retardo,
      minutosRetardo: a.Minutos_Retardo || 0,
      multiPlanta: a.Multi_Planta,
      planta: planta || null
    });
  }

  const filas = empleados.map(e => {
    const acc = porEmpleado.get(e.ID_Empleado) || { horas: 0, extras: 0, dias: 0, retardos: 0, multi: 0 };
    const horas = Math.round(acc.horas * 100) / 100;
    const extras = Math.round(acc.extras * 100) / 100;
    const jornada = e.tipo_horario?.Horas_Jornada || 8;
    const diasSemana = e.tipo_horario?.Dias_Semana || 6;
    const esperadas = jornada * diasSemana;

    // Matriz: una celda por cada fecha del rango
    const empDias = diasEmp.get(e.ID_Empleado);
    const celdas = fechas.map(f => {
      const key = f.toISOString().slice(0, 10);
      const c = empDias?.get(key);
      const esDomingo = f.getDay() === 0;
      if (!c) return { presente: false, vacio: !esDomingo, esDomingo };
      return { ...c, esDomingo, jornadaCompleta: c.horas >= (jornada - 0.5) };
    });

    return {
      ID_Empleado: e.ID_Empleado,
      nombre: [e.Nombre, e.Apellido_Paterno, e.Apellido_Materno].filter(Boolean).join(' '),
      area: e.area?.Nombre_Area || '',
      puesto: e.puesto?.Nombre_Puesto || '',
      horas, extras,
      normales: Math.round((horas - extras) * 100) / 100,
      dias: acc.dias, retardos: acc.retardos, multi: acc.multi,
      esperadas,
      faltantes: Math.max(0, Math.round((esperadas - horas) * 100) / 100),
      celdas
    };
  });

  const plantas = Array.from(porPlanta.entries())
    .map(([nombre, v]) => ({ nombre, horas: Math.round(v.horas * 100) / 100, dias: v.dias }))
    .sort((a, b) => b.horas - a.horas);

  return { periodo: { fechaInicio: inicio, fechaFin: fin }, filas, plantas, fechas };
}

/**
 * Obtiene el reporte de asistencia por ubicación (RAM1/RAM2)
 */
/**
 * Normaliza un string de ubicación para comparar ("RAM 1" == "ram1" == "RAM1").
 */
function normalizarUbicacion(str) {
  return (str || '').toString().trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Reporte por ubicación, dinámico desde Cat_Plantas.
 *
 * La planta de cada asistencia se resuelve, en orden de prioridad:
 *   1. ID_Checador_Entrada/Salida -> planta del checador (autoritativo ADMS)
 *   2. string Ubicacion_Entrada/Salida normalizado contra Cat_Plantas
 *      (match por Ubicacion_Codigo o por Nombre)
 * Lo que no haga match cae en un bucket "SIN_PLANTA" para que nada se pierda.
 *
 * @param {Object} p
 * @param {Date} p.fechaInicio
 * @param {Date} p.fechaFin
 * @param {number|null} p.plantaId  Filtro opcional por ID_Planta
 * @returns {Promise<{periodo:Object, plantas:Array}>}
 */
export async function obtenerReportePorUbicacion({
  fechaInicio,
  fechaFin,
  plantaId = null
}) {
  // Catálogo de plantas + checadores (para resolver FK y strings legacy)
  const [plantas, checadores] = await Promise.all([
    prisma.cat_Plantas.findMany({
      where: { Activo: true },
      orderBy: { ID_Planta: 'asc' }
    }),
    prisma.checadores.findMany({
      select: { ID_Checador: true, ID_Planta: true, Ubicacion_Codigo: true }
    })
  ]);

  // Mapas de resolución
  const checadorAPlanta = new Map(checadores.map(c => [c.ID_Checador, c.ID_Planta]));
  const stringAPlanta = new Map(); // normalizado -> ID_Planta
  for (const pl of plantas) {
    stringAPlanta.set(normalizarUbicacion(pl.Nombre), pl.ID_Planta);
  }
  for (const c of checadores) {
    if (c.Ubicacion_Codigo) stringAPlanta.set(normalizarUbicacion(c.Ubicacion_Codigo), c.ID_Planta);
  }

  // Buckets: uno por planta del catálogo + uno "sin planta" para huérfanos
  const SIN_PLANTA = -1;
  const buckets = new Map();
  for (const pl of plantas) {
    buckets.set(pl.ID_Planta, {
      id: pl.ID_Planta,
      nombre: pl.Nombre,
      empleados: new Set(),
      totalChecadas: 0,
      detalle: []
    });
  }
  buckets.set(SIN_PLANTA, {
    id: SIN_PLANTA,
    nombre: 'Sin planta asignada',
    empleados: new Set(),
    totalChecadas: 0,
    detalle: []
  });

  const resolverPlanta = (asistencia) => {
    // 1. FK del checador (entrada preferida)
    const idChk = asistencia.ID_Checador_Entrada ?? asistencia.ID_Checador_Salida;
    if (idChk != null && checadorAPlanta.has(idChk)) return checadorAPlanta.get(idChk);
    // 2. string legacy normalizado
    const str = normalizarUbicacion(asistencia.Ubicacion_Entrada || asistencia.Ubicacion_Salida);
    if (str && stringAPlanta.has(str)) return stringAPlanta.get(str);
    return SIN_PLANTA;
  };

  const asistencias = await prisma.empleados_Asistencia.findMany({
    where: {
      Fecha: { gte: fechaInicio, lte: fechaFin },
      Presente: true
    },
    include: {
      empleado: { include: { puesto: true, area: true } }
    },
    orderBy: [
      { Fecha: 'asc' },
      { empleado: { Nombre: 'asc' } }
    ]
  });

  for (const asistencia of asistencias) {
    const idPlanta = resolverPlanta(asistencia);
    if (plantaId && idPlanta !== plantaId) continue;

    const bucket = buckets.get(idPlanta);
    bucket.empleados.add(asistencia.ID_Empleado);
    bucket.totalChecadas++;
    bucket.detalle.push({
      fecha: asistencia.Fecha,
      empleado: {
        id: asistencia.empleado.ID_Empleado,
        nombre: `${asistencia.empleado.Nombre} ${asistencia.empleado.Apellido_Paterno}`,
        puesto: asistencia.empleado.puesto?.Nombre_Puesto,
        area: asistencia.empleado.area?.Nombre_Area
      },
      entrada: asistencia.Hora_Entrada,
      salida: asistencia.Hora_Salida,
      ubicacionEntrada: asistencia.Ubicacion_Entrada,
      ubicacionSalida: asistencia.Ubicacion_Salida,
      multiPlanta: asistencia.Multi_Planta
    });
  }

  // Salida: array de plantas. Omitir el bucket "sin planta" si quedó vacío
  // para no ensuciar la vista cuando todo está bien mapeado.
  const resultado = [];
  for (const bucket of buckets.values()) {
    if (bucket.id === SIN_PLANTA && bucket.totalChecadas === 0) continue;
    if (plantaId && bucket.id !== plantaId) continue;
    resultado.push({
      id: bucket.id,
      nombre: bucket.nombre,
      totalEmpleados: bucket.empleados.size,
      totalChecadas: bucket.totalChecadas,
      detalle: bucket.detalle
    });
  }

  return {
    periodo: { fechaInicio, fechaFin },
    plantas: resultado
  };
}

/**
 * Presencia EN VIVO por planta para una fecha (default hoy en TZ México).
 * "Presente ahora" = tiene entrada registrada y NO tiene salida ese día.
 *
 * @param {string|Date|null} fecha  YYYY-MM-DD o Date; null = hoy México
 * @returns {Promise<{fecha:string, plantas:Array, totalPresentes:number}>}
 */
export async function obtenerPresenciaPorPlanta(fecha = null) {
  const fechaStr = fecha
    ? horaLocalDevice(new Date(`${fecha}T12:00:00`)).fecha
    : horaLocalDevice().fecha;
  // Bounds en hora local del proceso (TZ=America/Mexico_City en el contenedor),
  // igual que admsService. Sin 'Z' para no desplazar -6h.
  const inicio = new Date(`${fechaStr}T00:00:00`); inicio.setHours(0, 0, 0, 0);
  const fin = new Date(`${fechaStr}T00:00:00`); fin.setHours(23, 59, 59, 999);

  const [plantas, checadores, asistencias] = await Promise.all([
    prisma.cat_Plantas.findMany({ where: { Activo: true }, orderBy: { ID_Planta: 'asc' } }),
    prisma.checadores.findMany({ select: { ID_Checador: true, ID_Planta: true, Ubicacion_Codigo: true } }),
    prisma.empleados_Asistencia.findMany({
      where: { Fecha: { gte: inicio, lte: fin }, Presente: true, Hora_Entrada: { not: null } },
      include: { empleado: { include: { puesto: true, area: true } } },
      orderBy: { Hora_Entrada: 'asc' }
    })
  ]);

  const checadorAPlanta = new Map(checadores.map(c => [c.ID_Checador, c.ID_Planta]));
  const stringAPlanta = new Map();
  for (const pl of plantas) stringAPlanta.set(normalizarUbicacion(pl.Nombre), pl.ID_Planta);
  for (const c of checadores) {
    if (c.Ubicacion_Codigo) stringAPlanta.set(normalizarUbicacion(c.Ubicacion_Codigo), c.ID_Planta);
  }

  const SIN_PLANTA = -1;
  const buckets = new Map();
  for (const pl of plantas) {
    buckets.set(pl.ID_Planta, { id: pl.ID_Planta, nombre: pl.Nombre, presentes: [] });
  }
  buckets.set(SIN_PLANTA, { id: SIN_PLANTA, nombre: 'Sin planta asignada', presentes: [] });

  let totalPresentes = 0;
  for (const a of asistencias) {
    // Sigue dentro si no ha marcado salida
    if (a.Hora_Salida) continue;
    // Planta actual = la de la entrada
    const idChk = a.ID_Checador_Entrada ?? a.ID_Checador_Salida;
    let idPlanta = (idChk != null && checadorAPlanta.has(idChk)) ? checadorAPlanta.get(idChk) : null;
    if (idPlanta == null) {
      const str = normalizarUbicacion(a.Ubicacion_Entrada || a.Ubicacion_Salida);
      idPlanta = stringAPlanta.has(str) ? stringAPlanta.get(str) : SIN_PLANTA;
    }
    buckets.get(idPlanta).presentes.push({
      id: a.empleado.ID_Empleado,
      nombre: `${a.empleado.Nombre} ${a.empleado.Apellido_Paterno} ${a.empleado.Apellido_Materno || ''}`.trim(),
      puesto: a.empleado.puesto?.Nombre_Puesto,
      area: a.empleado.area?.Nombre_Area,
      entrada: a.Hora_Entrada,
      retardo: a.Retardo
    });
    totalPresentes++;
  }

  const resultado = [];
  for (const b of buckets.values()) {
    if (b.id === SIN_PLANTA && b.presentes.length === 0) continue;
    // Agrupar los presentes de la planta por área (anidado para el acordeón)
    const areaMap = new Map();
    for (const p of b.presentes) {
      const area = p.area || 'Sin área';
      if (!areaMap.has(area)) areaMap.set(area, []);
      areaMap.get(area).push(p);
    }
    const areas = Array.from(areaMap.entries())
      .map(([nombre, empleados]) => ({ nombre, total: empleados.length, empleados }))
      .sort((x, y) => y.total - x.total);
    resultado.push({ ...b, total: b.presentes.length, areas });
  }

  return { fecha: fechaStr, plantas: resultado, totalPresentes };
}

/**
 * Desglose cronológico COMPLETO de checadas de un día (todas, no limitado).
 * Cada checada con su planta resuelta (checador FK -> string legacy).
 *
 * @param {string|Date|null} fecha  YYYY-MM-DD o Date; null = hoy México
 * @param {number|null} plantaId    Filtro opcional por ID_Planta
 * @returns {Promise<{fecha:string, checadas:Array, total:number}>}
 */
export async function obtenerChecadasDelDia(fecha = null, plantaId = null) {
  const fechaStr = fecha
    ? horaLocalDevice(new Date(`${fecha}T12:00:00`)).fecha
    : horaLocalDevice().fecha;
  const inicio = new Date(`${fechaStr}T00:00:00`); inicio.setHours(0, 0, 0, 0);
  const fin = new Date(`${fechaStr}T00:00:00`); fin.setHours(23, 59, 59, 999);

  const checadas = await prisma.historial_Checadas.findMany({
    where: { Fecha_Hora: { gte: inicio, lte: fin } },
    orderBy: { Fecha_Hora: 'asc' },
    include: {
      checador: { select: { ID_Planta: true, Nombre: true, planta: { select: { Nombre: true } } } },
      asistencia: {
        include: {
          empleado: {
            select: {
              ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true,
              area: { select: { Nombre_Area: true } }
            }
          }
        }
      }
    }
  });

  // Marcar dobles checadas (misma regla que el cálculo: por empleado, global,
  // ventana 1h vs la última conservada). Se computa sobre TODAS las checadas
  // del empleado, ANTES del filtro de planta, para que el flag sea coherente.
  const VENTANA_MIN = 60;
  const ultimaConservadaPorEmp = new Map(); // ID_Empleado -> minutos del día
  const minutosDelDia = (d) => d.getHours() * 60 + d.getMinutes();
  const dobles = new Set(); // ID_Checada ignoradas
  for (const c of checadas) {
    const empId = c.asistencia?.empleado?.ID_Empleado;
    if (empId == null) continue;
    const min = minutosDelDia(c.Fecha_Hora);
    const ult = ultimaConservadaPorEmp.get(empId);
    if (ult != null && min - ult < VENTANA_MIN) {
      dobles.add(c.ID_Checada); // dentro de la ventana -> doble, ignorada
    } else {
      ultimaConservadaPorEmp.set(empId, min); // conservada -> reinicia ventana
    }
  }

  const filas = [];
  for (const c of checadas) {
    const idPlanta = c.checador?.ID_Planta ?? null;
    if (plantaId && idPlanta !== plantaId) continue;
    const emp = c.asistencia?.empleado;
    filas.push({
      hora: c.Fecha_Hora,
      tipo: c.Tipo_Checada,
      estado: c.Estado,
      origen: c.Origen_Sincronizacion,
      dispositivo: c.checador?.Nombre || c.Dispositivo || null,
      planta: c.checador?.planta?.Nombre || c.Ubicacion || 'Sin planta',
      plantaId: idPlanta,
      ignoradaDoble: dobles.has(c.ID_Checada),
      empleado: emp ? {
        id: emp.ID_Empleado,
        nombre: `${emp.Nombre} ${emp.Apellido_Paterno} ${emp.Apellido_Materno || ''}`.trim(),
        area: emp.area?.Nombre_Area
      } : null
    });
  }

  return { fecha: fechaStr, checadas: filas, total: filas.length };
}

/**
 * Obtiene el resumen diario de asistencia
 */
export async function obtenerResumenDiario(fecha = new Date()) {
  const fechaInicio = new Date(fecha);
  fechaInicio.setHours(0, 0, 0, 0);
  
  const fechaFin = new Date(fecha);
  fechaFin.setHours(23, 59, 59, 999);

  const asistencias = await prisma.empleados_Asistencia.findMany({
    where: {
      Fecha: {
        gte: fechaInicio,
        lte: fechaFin
      }
    },
    include: {
      empleado: {
        include: {
          puesto: true,
          area: true
        }
      }
    },
    orderBy: {
      Hora_Entrada: 'asc'
    }
  });

  // Obtener total de empleados activos
  const totalEmpleadosActivos = await prisma.empleados.count({
    where: {
      estatus: {
        is: { Nombre_Estatus: 'ACTIVO' }
      }
    }
  });

  const presentes = asistencias.filter(a => a.Presente);
  const conEntrada = asistencias.filter(a => a.Hora_Entrada);
  const conSalida = asistencias.filter(a => a.Hora_Salida);
  const conRetardo = asistencias.filter(a => a.Retardo);

  // Conteo por ubicación dinámico (cualquier planta, no solo RAM1/RAM2)
  const porUbicacionMap = new Map();
  for (const a of presentes) {
    const ubi = a.Ubicacion_Entrada || a.Ubicacion_Salida;
    if (!ubi) continue;
    porUbicacionMap.set(ubi, (porUbicacionMap.get(ubi) || 0) + 1);
  }
  const porUbicacion = Array.from(porUbicacionMap.entries())
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => b.total - a.total);

  return {
    fecha,
    totalEmpleadosActivos,
    totalPresentes: presentes.length,
    totalAusentes: totalEmpleadosActivos - presentes.length,
    porcentajeAsistencia: totalEmpleadosActivos > 0
      ? Math.round((presentes.length / totalEmpleadosActivos) * 100)
      : 0,
    conEntrada: conEntrada.length,
    conSalida: conSalida.length,
    conRetardo: conRetardo.length,
    porUbicacion,
    detalle: asistencias.map(a => ({
      empleadoId: a.ID_Empleado,
      nombreCompleto: `${a.empleado.Nombre} ${a.empleado.Apellido_Paterno} ${a.empleado.Apellido_Materno || ''}`.trim(),
      puesto: a.empleado.puesto?.Nombre_Puesto,
      area: a.empleado.area?.Nombre_Area,
      presente: a.Presente,
      horaEntrada: a.Hora_Entrada,
      horaSalida: a.Hora_Salida,
      retardo: a.Retardo,
      minutosRetardo: a.Minutos_Retardo,
      ubicacionEntrada: a.Ubicacion_Entrada,
      ubicacionSalida: a.Ubicacion_Salida
    }))
  };
}

// ============================================================
// MARCAR FALTAS AUTOMÁTICAMENTE
// ============================================================

/**
 * Marca faltas para empleados que no registraron entrada
 * Ejecutar al final del día o al día siguiente
 */
export async function marcarFaltasAutomaticas(fecha = null) {
  // Si no se especifica fecha, usar ayer
  const fechaProcesar = fecha ? new Date(fecha) : new Date();
  if (!fecha) {
    fechaProcesar.setDate(fechaProcesar.getDate() - 1);
  }
  fechaProcesar.setHours(0, 0, 0, 0);

  const fechaFin = new Date(fechaProcesar);
  fechaFin.setHours(23, 59, 59, 999);

  // Obtener todos los empleados activos
  const empleadosActivos = await prisma.empleados.findMany({
    where: {
      estatus: {
        is: { Nombre_Estatus: 'ACTIVO' }
      },
      Fecha_Ingreso: {
        lte: fechaProcesar
      }
    },
    select: {
      ID_Empleado: true,
      Nombre: true,
      Apellido_Paterno: true
    }
  });

  // Obtener asistencias registradas del día
  const asistenciasDelDia = await prisma.empleados_Asistencia.findMany({
    where: {
      Fecha: {
        gte: fechaProcesar,
        lte: fechaFin
      }
    },
    select: {
      ID_Empleado: true
    }
  });

  const empleadosConAsistencia = new Set(
    asistenciasDelDia.map(a => a.ID_Empleado)
  );

  // Empleados sin registro de asistencia
  const empleadosSinAsistencia = empleadosActivos.filter(
    e => !empleadosConAsistencia.has(e.ID_Empleado)
  );

  // Verificar si el día es laboral (L-S)
  const diaSemana = fechaProcesar.getDay();
  if (diaSemana === 0) { // Domingo
    return {
      fecha: fechaProcesar,
      mensaje: 'Domingo - No es día laboral',
      faltasMarcadas: 0
    };
  }

  // Crear registros de falta
  const faltasCreadas = [];
  for (const empleado of empleadosSinAsistencia) {
    // Verificar si no tiene incidencia justificada
    const incidenciaJustificada = await prisma.empleados_Incidencias.findFirst({
      where: {
        ID_Empleado: empleado.ID_Empleado,
        Fecha_Inicio: { lte: fechaProcesar },
        Fecha_Fin: { gte: fechaProcesar },
        Estado: 'APROBADA'
      }
    });

    if (!incidenciaJustificada) {
      const falta = await prisma.empleados_Asistencia.create({
        data: {
          ID_Empleado: empleado.ID_Empleado,
          Fecha: fechaProcesar,
          Presente: false,
          Notas: 'Falta marcada automáticamente - Sin registro de entrada'
        }
      });

      faltasCreadas.push({
        empleadoId: empleado.ID_Empleado,
        nombre: `${empleado.Nombre} ${empleado.Apellido_Paterno}`,
        fecha: fechaProcesar
      });
    }
  }

  return {
    fecha: fechaProcesar,
    totalEmpleadosActivos: empleadosActivos.length,
    empleadosConAsistencia: empleadosConAsistencia.size,
    faltasMarcadas: faltasCreadas.length,
    detalle: faltasCreadas
  };
}

// ============================================================
// EXPORTAR FUNCIONES
// ============================================================

export default {
  registrarChecada,
  obtenerResumenAsistencia,
  obtenerReportePorUbicacion,
  obtenerPresenciaPorPlanta,
  obtenerChecadasDelDia,
  obtenerResumenDiario,
  marcarFaltasAutomaticas,
  calcularHorasDesdeChecadas,
  obtenerDesgloseHoras,
  obtenerHorasSemanalTodos,
  UBICACIONES
};
