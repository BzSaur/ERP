/**
 * Servicio de Asistencia - RAM
 * Manejo de checadas biométricas desde RAM1 y RAM2
 * 
 * Configuración:
 * - Entrada: 8:00 hrs
 * - Salida: 17:00 hrs
 * - Comida: 14:00-15:00 (sin goce de sueldo)
 */

import prisma from '../config/database.js';
import { getConfig, getConfigMultiple } from './nominaService.js';
import { calcularHorasPorPares, minutosAHora, esAreaCoberturaEspecial, entradaCobertura, reglaToleranciaPorFecha } from './checadorImportService.js';
import { horaLocalDevice, esDiaEnCurso, minutosDelDiaAhora, fechaLocalDB } from '../utils/tiempo.js';

// ============================================================
// CONSTANTES Y CONFIGURACIÓN
// ============================================================

const UBICACIONES = {
  RAM1: 'RAM1',
  RAM2: 'RAM2'
};

// Límite de horas normales por semana (fijo para todos). Lo que exceda este
// total semanal (sumando L-S, incluido sábado) se paga como extra. No hay
// extra por día (post-18:00) — el extra es puramente el excedente semanal.
const LIMITE_SEMANAL_HORAS = 45;

// ============================================================
// FILTRO DE VISIBILIDAD POR USUARIO (permisos granulares)
// ============================================================

/**
 * Resuelve el filtro de visibilidad de un usuario. Devuelve null si el usuario ve TODO
 * (no es CONSULTA, o es CONSULTA sin asignaciones = opt-in). Si tiene asignaciones,
 * devuelve { plantaIds:Set, areaIds:Set }; la visibilidad es INTERSECCIÓN por dimensión
 * (ver asistenciaVisible): debe cumplir cada dimensión que tenga restricción.
 * @param {Object} user req.user (con rol)
 * @returns {Promise<null | { plantaIds:Set<number>, areaIds:Set<number> }>}
 */
export async function getFiltroVisibilidad(user) {
  const rol = (user?.rol?.Nombre_Rol || '').toUpperCase().replace(/\s+/g, '_');
  if (rol !== 'CONSULTA') return null; // solo CONSULTA se restringe
  const idUsuario = user?.ID_Usuario;
  if (!idUsuario) return null;

  const [plantas, areas] = await Promise.all([
    prisma.consultor_Plantas.findMany({ where: { ID_Usuario: idUsuario }, select: { ID_Planta: true } }),
    prisma.consultor_Areas.findMany({ where: { ID_Usuario: idUsuario }, select: { ID_Area: true } })
  ]);
  // Sin asignaciones = ve todo (opt-in).
  if (plantas.length === 0 && areas.length === 0) return null;
  return {
    plantaIds: new Set(plantas.map(p => p.ID_Planta)),
    areaIds: new Set(areas.map(a => a.ID_Area))
  };
}

/**
 * ¿La asistencia es visible bajo el filtro? INTERSECCIÓN (AND) por dimensión: debe cumplir
 * TODAS las dimensiones que tengan restricción. Una dimensión SIN asignaciones NO restringe.
 *  - plantas + áreas asignadas → planta permitida Y área permitida.
 *  - solo plantas → solo restringe por planta.
 *  - solo áreas → solo restringe por área.
 * filtro=null => siempre visible.
 * @param {Object} args { idPlanta, idArea } de la asistencia/empleado
 * @param {null|{plantaIds:Set,areaIds:Set}} filtro
 */
export function asistenciaVisible({ idPlanta, idArea }, filtro) {
  if (!filtro) return true;
  if (filtro.plantaIds.size > 0 && !(idPlanta != null && filtro.plantaIds.has(idPlanta))) return false;
  if (filtro.areaIds.size > 0 && !(idArea != null && filtro.areaIds.has(idArea))) return false;
  return true;
}

// ============================================================
// AUSENCIAS JUSTIFICADAS (vacaciones / incidencias aprobadas)
// ============================================================

// Día calendario como número YYYYMMDD, extraído en UTC. Robusto para las dos
// representaciones que conviven aquí (TZ del proceso = America/Mexico_City):
//  - columnas @db.Date leídas a medianoche UTC (00:00Z) -> partes UTC = ese día
//  - fechas construidas a medianoche local (06:00Z)      -> partes UTC = ese día
// Mismo criterio que las llaves de la matriz (toISOString().slice(0,10)).
// NO usar partes locales: una @db.Date a 00:00Z se correría -1 día.
const ymdUTC = d => { const x = new Date(d); return x.getUTCFullYear() * 10000 + (x.getUTCMonth() + 1) * 100 + x.getUTCDate(); };

/**
 * Periodos de ausencia justificada que se traslapan con el rango:
 * vacaciones (EN_CURSO/TOMADAS con fechas) e incidencias APROBADAS.
 * El empleado NO está deshabilitado ni sale del checador: solo se etiquetan
 * esos días en las vistas de asistencia para no contarlos como falta.
 *
 * @param {Date} fechaInicio
 * @param {Date} fechaFin
 * @param {number|null} empleadoId  limitar a un empleado (opcional)
 * @returns {Promise<Map<number, Array<{desde:number, hasta:number, etiqueta:string}>>>}
 */
export async function obtenerAusenciasJustificadas(fechaInicio, fechaFin, empleadoId = null) {
  // Margen de 1 día en la query por el desfase UTC/local de @db.Date;
  // el filtro exacto por día lo hace ausenciaEnFecha con YYYYMMDD.
  const desde = new Date(new Date(fechaInicio).getTime() - 24 * 3600 * 1000);
  const hasta = new Date(new Date(fechaFin).getTime() + 24 * 3600 * 1000);
  const porEmpleado = empleadoId ? { ID_Empleado: empleadoId } : {};

  const [vacaciones, incidencias] = await Promise.all([
    prisma.vacaciones.findMany({
      where: {
        ...porEmpleado,
        Estado: { in: ['EN_CURSO', 'TOMADAS'] },
        Fecha_Inicio: { lte: hasta },
        Fecha_Fin: { gte: desde }
      },
      select: { ID_Empleado: true, Fecha_Inicio: true, Fecha_Fin: true }
    }),
    prisma.empleados_Incidencias.findMany({
      where: {
        ...porEmpleado,
        Estado: 'APROBADA',
        Fecha_Inicio: { lte: hasta },
        Fecha_Fin: { gte: desde }
      },
      select: {
        ID_Empleado: true, Fecha_Inicio: true, Fecha_Fin: true,
        tipo_incidencia: { select: { Nombre: true } }
      }
    })
  ]);

  const mapa = new Map();
  const agregar = (id, ini, fin, etiqueta) => {
    if (!ini || !fin) return;
    if (!mapa.has(id)) mapa.set(id, []);
    mapa.get(id).push({ desde: ymdUTC(ini), hasta: ymdUTC(fin), etiqueta });
  };
  for (const v of vacaciones) agregar(v.ID_Empleado, v.Fecha_Inicio, v.Fecha_Fin, 'Vacaciones');
  for (const i of incidencias) agregar(i.ID_Empleado, i.Fecha_Inicio, i.Fecha_Fin, i.tipo_incidencia?.Nombre || 'Permiso');
  return mapa;
}

/**
 * Etiqueta de ausencia justificada de un empleado en una fecha, o null.
 * Acepta Date de @db.Date (medianoche UTC) o construido local (ver ymdUTC).
 * @param {Map} mapa  salida de obtenerAusenciasJustificadas
 */
export function ausenciaEnFecha(mapa, empleadoId, fecha) {
  const periodos = mapa?.get(empleadoId);
  if (!periodos) return null;
  const ymd = ymdUTC(fecha);
  const p = periodos.find(p => ymd >= p.desde && ymd <= p.hasta);
  return p ? p.etiqueta : null;
}

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
      area: true,
      puesto: true
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
        const { aplicaCobertura } = reglaToleranciaPorFecha(fechaHora);
        const cobertura = aplicaCobertura && esAreaCoberturaEspecial({
          area: empleado.area?.Nombre_Area,
          puesto: empleado.puesto?.Nombre_Puesto
        });
        const minutos = estadoChecada.minutosRetardo;
        const enVentanaCobertura = cobertura && minutos >= 15 && minutos <= 25;
        if (!enVentanaCobertura) {
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

  // Registrar en historial de checadas. Origen MANUAL si viene del alta manual,
  // para distinguirlo del push biométrico en las vistas.
  await prisma.historial_Checadas.create({
    data: {
      ID_Asistencia: asistencia.ID_Asistencia,
      Tipo_Checada: tipoChecada,
      Fecha_Hora: fechaHora,
      Ubicacion: ubicacion,
      Dispositivo: dispositivo,
      Origen_Sincronizacion: dispositivo === 'MANUAL' ? 'MANUAL' : 'ADMS_PUSH',
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
 * (calcularHorasDia: comida condicional 14-15, extras >18:00,
 * sábados, RAM1+RAM2 consolidado por ser todas las checadas del día).
 *
 * Fuente única de verdad para el cálculo de horas en todo el sistema.
 *
 * @param {Array} checadasHistorial - filas de Historial_Checadas del día (con Fecha_Hora)
 * @param {Date} fecha - fecha del día (para detectar sábado)
 * @param {Object} opts
 * @returns resultado de calcularHorasDia
 */
export function calcularHorasDesdeChecadas(checadasHistorial, fecha, opts = {}) {
  const checadas = (checadasHistorial || [])
    .map(c => {
      const d = new Date(c.Fecha_Hora);
      const h = d.getHours();
      const m = d.getMinutes();
      return { hora: h, minuto: m, totalMinutos: h * 60 + m, horaStr: minutosAHora(h * 60 + m) };
    })
    .sort((a, b) => a.totalMinutos - b.totalMinutos);

  const esSabado = new Date(fecha).getDay() === 6;
  // Día en curso: no estimar salida a 18:00; cerrar a la hora actual (México).
  const minutoCierre = esDiaEnCurso(fecha) ? minutosDelDiaAhora() : undefined;
  const { toleranciaMin, aplicaCobertura } = reglaToleranciaPorFecha(fecha);
  return calcularHorasPorPares(checadas, {
    esSabado,
    toleranciaMin,
    coberturaEspecial: aplicaCobertura && !!opts.coberturaEspecial,
    ...(minutoCierre != null ? { minutoCierre } : {})
  });
}

/**
 * Obtiene el resumen de asistencia de un empleado para un período
 */
export async function obtenerResumenAsistencia({
  empleadoId,
  fechaInicio,
  fechaFin
}) {
  const [asistencias, empleadoInfo, ausencias] = await Promise.all([
    prisma.empleados_Asistencia.findMany({
      where: {
        ID_Empleado: empleadoId,
        Fecha: {
          gte: fechaInicio,
          lte: fechaFin
        }
      },
      orderBy: { Fecha: 'asc' }
    }),
    prisma.empleados.findUnique({
      where: { ID_Empleado: empleadoId },
      select: { area: { select: { Nombre_Area: true } }, puesto: { select: { Nombre_Puesto: true } } }
    }),
    obtenerAusenciasJustificadas(fechaInicio, fechaFin, empleadoId)
  ]);
  const empParaRegla = { area: empleadoInfo?.area, puesto: empleadoInfo?.puesto };

  const resumen = {
    periodo: { fechaInicio, fechaFin },
    totalDias: asistencias.length,
    diasPresentes: 0,
    diasAusentes: 0,
    diasJustificados: 0, // vacaciones/incidencia aprobada: no cuentan como falta
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
    // Retardo derivado de la entrada mostrada (ajustada), coherente con lo que se ve.
    // Fecha de BD (@db.Date, medianoche UTC) a local para getDay/regla de tolerancia.
    const fechaDia = fechaLocalDB(asistencia.Fecha);
    const entradaMostrada = entradaPagoDesde(asistencia.Hora_Entrada, empParaRegla) || asistencia.Hora_Entrada;
    const retardoDia = asistencia.Presente && hayRetardoEnEntrada(entradaMostrada, fechaDia);
    const etiquetaAusencia = ausenciaEnFecha(ausencias, empleadoId, fechaDia);

    if (asistencia.Presente) {
      resumen.diasPresentes++;

      if (retardoDia) {
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
    } else if (etiquetaAusencia) {
      resumen.diasJustificados++; // vacaciones/permiso: no es falta
    } else {
      resumen.diasAusentes++;
    }

    resumen.detalle.push({
      fecha: fechaDia,
      presente: asistencia.Presente,
      ausencia: etiquetaAusencia,
      entrada: entradaMostrada,
      entradaReal: asistencia.Hora_Entrada,
      salida: asistencia.Hora_Salida,
      retardo: retardoDia,
      minutosRetardo: asistencia.Minutos_Retardo,
      ubicacionEntrada: asistencia.Ubicacion_Entrada,
      ubicacionSalida: asistencia.Ubicacion_Salida
    });
  }

  resumen.horasTrabajadas = Math.round(resumen.horasTrabajadas * 100) / 100;

  return resumen;
}

/**
 * Pares entrada/salida (HH:MM) para visualización, formados de checadas consecutivas.
 * @param {Array} checadas filas de Historial_Checadas (con Fecha_Hora), ordenadas asc
 * @param {Object} [empleadoRegla] { area, puesto }
 */
function paresDesdeChecadas(checadas, empleadoRegla) {
  const fmt = d => { const x = new Date(d); return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); };
  const pares = [];
  for (let i = 0; i < checadas.length; i += 2) {
    const entradaDate = (i === 0 && empleadoRegla)
      ? (entradaPagoDesde(checadas[i].Fecha_Hora, empleadoRegla) || checadas[i].Fecha_Hora)
      : checadas[i].Fecha_Hora;
    pares.push({
      entrada: fmt(entradaDate),
      salida: checadas[i + 1] ? fmt(checadas[i + 1].Fecha_Hora) : null
    });
  }
  return pares;
}

/**
 * Desglose de horas por día y total semanal de un empleado. Horas/retardo/entrada
 * vienen de la BD consolidada (Empleados_Asistencia); las checadas crudas se incluyen
 * solo como detalle de auditoría.
 *
 * @param {number} empleadoId
 * @param {Date} fechaInicio - lunes de la semana (o inicio de rango)
 * @param {Date} fechaFin - sábado/domingo (o fin de rango)
 */
export async function obtenerDesgloseHoras(empleadoId, fechaInicio, fechaFin) {
  const inicio = new Date(fechaInicio); inicio.setHours(0, 0, 0, 0);
  const fin = new Date(fechaFin); fin.setHours(23, 59, 59, 999);

  const [asistencias, empleadoInfo, ausencias] = await Promise.all([
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
      select: { area: { select: { Nombre_Area: true } }, puesto: { select: { Nombre_Puesto: true } } }
    }),
    obtenerAusenciasJustificadas(inicio, fin, empleadoId)
  ]);
  const empParaRegla = { area: empleadoInfo?.area, puesto: empleadoInfo?.puesto };

  const NOMBRES_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const dias = [];
  let totalHoras = 0;
  let diasTrabajados = 0, diasRetardo = 0, diasMultiPlanta = 0;
  let minutosRetardoTotal = 0;
  const horasPorPlanta = new Map(); // planta -> horas

  for (const a of asistencias) {
    // @db.Date a medianoche local: getDay/nombreDia/tolerancia correctos en México.
    const fecha = fechaLocalDB(a.Fecha);
    const checadas = a.historial_checadas || [];
    // Horas/retardo/entrada desde la BD consolidada (Empleados_Asistencia). Fuente única =
    // BD, igual que la vista global y el Excel. Las checadas crudas son solo auditoría.
    const horas = Number(a.Horas_Trabajadas) || 0;
    const entradaMostradaDia = entradaPagoDesde(a.Hora_Entrada, empParaRegla);
    const retardoDia = a.Presente && hayRetardoEnEntrada(entradaMostradaDia, fecha);
    const minRetardoDia = a.Minutos_Retardo || 0;
    if (a.Presente && horas > 0) diasTrabajados++;
    if (retardoDia) { diasRetardo++; minutosRetardoTotal += minRetardoDia; }
    if (a.Multi_Planta) diasMultiPlanta++;
    totalHoras += horas;

    // Horas por planta (ubicación de entrada como planta del día)
    const plantaDia = a.Ubicacion_Entrada || a.Ubicacion_Salida;
    if (plantaDia && horas > 0) {
      horasPorPlanta.set(plantaDia, (horasPorPlanta.get(plantaDia) || 0) + horas);
    }

    dias.push({
      fecha,
      nombreDia: NOMBRES_DIA[fecha.getDay()],
      // Vacaciones / incidencia aprobada ese día (etiqueta o null). El día no
      // cuenta como falta; si además hay checadas, se muestran normal.
      ausencia: ausenciaEnFecha(ausencias, empleadoId, fecha),
      presente: a.Presente,
      entrada: entradaMostradaDia,
      entradaReal: a.Hora_Entrada ? new Date(a.Hora_Entrada) : null,
      salida: a.Hora_Salida ? new Date(a.Hora_Salida) : null,
      // El extra ya no es por día: es el excedente semanal sobre 45h (ver totales).
      horas, extras: 0,
      normales: horas,
      retardo: retardoDia,
      minutosRetardo: minRetardoDia,
      multiPlanta: a.Multi_Planta,
      ubicacionEntrada: a.Ubicacion_Entrada,
      ubicacionSalida: a.Ubicacion_Salida,
      minutosComida: 0,
      totalChecadas: checadas.length,
      incompleta: a.Presente && (!a.Hora_Entrada || !a.Hora_Salida),
      // Pares entrada-salida para visualización (consecutivos desde checadas crudas).
      pares: paresDesdeChecadas(checadas, empParaRegla),
      checadas: checadas.map(c => ({
        hora: new Date(c.Fecha_Hora),
        tipo: c.Tipo_Checada,
        planta: c.checador?.planta?.Nombre || c.Ubicacion,
        origen: c.Origen_Sincronizacion
      })),
      notas: a.Notas || ''
    });
  }

  // Días de ausencia justificada SIN registro de asistencia: agregar fila
  // sintética para que la vacación/permiso sea visible en la tabla.
  const ymdConRegistro = new Set(dias.map(d => ymdUTC(d.fecha)));
  for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0) continue; // domingo no laborable
    if (ymdConRegistro.has(ymdUTC(d))) continue;
    const etiqueta = ausenciaEnFecha(ausencias, empleadoId, d);
    if (!etiqueta) continue;
    const fecha = new Date(d); fecha.setHours(0, 0, 0, 0);
    dias.push({
      fecha,
      nombreDia: NOMBRES_DIA[fecha.getDay()],
      ausencia: etiqueta,
      presente: false,
      entrada: null, entradaReal: null, salida: null,
      horas: 0, extras: 0, normales: 0,
      retardo: false, minutosRetardo: 0,
      multiPlanta: false, ubicacionEntrada: null, ubicacionSalida: null,
      minutosComida: 0, totalChecadas: 0, incompleta: false,
      pares: [], checadas: [], notas: ''
    });
  }
  dias.sort((a, b) => a.fecha - b.fecha);

  // ---- KPIs ----
  // Límite semanal FIJO de 45h para todos. El extra es el excedente semanal
  // (incluye sábado en el total); no hay extra por día.
  const limiteSemana = LIMITE_SEMANAL_HORAS;
  const horasRedondeadas = Math.round(totalHoras * 100) / 100;
  const extrasSobreLimite = Math.max(0, Math.round((horasRedondeadas - limiteSemana) * 100) / 100);
  const normalesSemana = Math.round((horasRedondeadas - extrasSobreLimite) * 100) / 100;
  // Días laborables del rango (L-S, sin domingos). Los días de ausencia
  // justificada (vacaciones/permiso) en que NO trabajó no cuentan como
  // laborables: no penalizan el % de cumplimiento.
  const ymdTrabajados = new Set(dias.filter(x => x.presente && x.horas > 0).map(x => ymdUTC(x.fecha)));
  let diasLaborables = 0;
  let diasAusenciaJustificada = 0;
  for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0) continue;
    if (ausenciaEnFecha(ausencias, empleadoId, d) && !ymdTrabajados.has(ymdUTC(d))) {
      diasAusenciaJustificada++;
      continue;
    }
    diasLaborables++;
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
      normales: normalesSemana,
      extras: extrasSobreLimite,
      diasTrabajados, diasRetardo, diasMultiPlanta
    },
    kpis: {
      limiteSemana,
      extrasSobreLimite,
      minutosRetardoTotal,
      diasRetardo,
      diasLaborables,
      diasAusenciaJustificada,
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
export async function obtenerHorasSemanalTodos(fechaInicio, fechaFin, filtro = null) {
  const inicio = new Date(fechaInicio); inicio.setHours(0, 0, 0, 0);
  const fin = new Date(fechaFin); fin.setHours(23, 59, 59, 999);

  let empleados = await prisma.empleados.findMany({
    where: { ID_Estatus: 1 },
    select: {
      ID_Empleado: true, ID_Area: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true,
      area: { select: { Nombre_Area: true } },
      puesto: { select: { Nombre_Puesto: true } },
      tipo_horario: { select: { Horas_Jornada: true, Dias_Semana: true } }
    },
    orderBy: [{ Apellido_Paterno: 'asc' }, { Nombre: 'asc' }]
  });

  // Mapa ID_Area por empleado (para filtrar cada jornada por área+planta).
  const areaPorEmp = new Map(empleados.map(e => [e.ID_Empleado, e.ID_Area]));

  // Resolvedor de planta por asistencia (checador FK -> string legacy). Se usa para
  // filtrar CADA jornada por planta cuando hay filtro de consultor.
  let resolverPlantaAsist = null;
  if (filtro) {
    const chks = await prisma.checadores.findMany({ select: { ID_Checador: true, ID_Planta: true, Ubicacion_Codigo: true } });
    const chkAPlanta = new Map(chks.map(c => [c.ID_Checador, c.ID_Planta]));
    const strAPlanta = new Map();
    const plantasCat = await prisma.cat_Plantas.findMany({ select: { ID_Planta: true, Nombre: true } });
    for (const pl of plantasCat) strAPlanta.set(normalizarUbicacion(pl.Nombre), pl.ID_Planta);
    for (const c of chks) if (c.Ubicacion_Codigo) strAPlanta.set(normalizarUbicacion(c.Ubicacion_Codigo), c.ID_Planta);
    resolverPlantaAsist = (a) => {
      let idP = a.ID_Checador_Entrada != null ? chkAPlanta.get(a.ID_Checador_Entrada) : null;
      if (idP == null) idP = a.ID_Checador_Salida != null ? chkAPlanta.get(a.ID_Checador_Salida) : null;
      if (idP == null) idP = strAPlanta.get(normalizarUbicacion(a.Ubicacion_Entrada || a.Ubicacion_Salida));
      return idP ?? null;
    };
  }

  const empReglaMap = new Map(empleados.map(e => [e.ID_Empleado, { area: e.area, puesto: e.puesto }]));

  // Todas las asistencias del rango, agrupadas en memoria por empleado
  const asistencias = await prisma.empleados_Asistencia.findMany({
    where: { Fecha: { gte: inicio, lte: fin } },
    select: {
      ID_Empleado: true, Fecha: true, Presente: true, Retardo: true, Multi_Planta: true,
      Hora_Entrada: true, Hora_Salida: true, Minutos_Retardo: true,
      Horas_Trabajadas: true, Horas_Extras: true,
      Ubicacion_Entrada: true, Ubicacion_Salida: true,
      ID_Checador_Entrada: true, ID_Checador_Salida: true
    }
  });

  // Vacaciones e incidencias aprobadas del rango (etiqueta por empleado/día).
  const ausencias = await obtenerAusenciasJustificadas(inicio, fin);

  // Lista de fechas del rango (para la matriz)
  const fechas = [];
  for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    const f = new Date(d); f.setHours(0, 0, 0, 0);
    fechas.push(f);
  }

  const porEmpleado = new Map();
  const porPlanta = new Map();   // planta -> { horas, dias }
  const diasEmp = new Map();     // ID_Empleado -> (yyyy-mm-dd -> celda)
  const empConDatos = new Set(); // empleados con al menos una jornada visible
  for (const a of asistencias) {
    // Filtro por JORNADA (no por empleado): cada día debe cumplir planta+área del filtro.
    if (filtro) {
      const idPlanta = resolverPlantaAsist(a);
      if (!asistenciaVisible({ idPlanta, idArea: areaPorEmp.get(a.ID_Empleado) }, filtro)) continue;
      empConDatos.add(a.ID_Empleado);
    }
    const acc = porEmpleado.get(a.ID_Empleado) || { horas: 0, extras: 0, dias: 0, retardos: 0, multi: 0 };
    const h = Number(a.Horas_Trabajadas) || 0;
    // Retardo derivado de la entrada mostrada (coherente con lo que se ve).
    const entradaCelda = entradaPagoDesde(a.Hora_Entrada, empReglaMap.get(a.ID_Empleado));
    const esRetardo = a.Presente && hayRetardoEnEntrada(entradaCelda, fechaLocalDB(a.Fecha));
    if (a.Presente && h > 0) acc.dias++;
    if (esRetardo) acc.retardos++;
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
    const entrada = entradaCelda;
    const salida = a.Hora_Salida ? new Date(a.Hora_Salida) : null;
    const fmt = d => d ? String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0') : null;
    const incompleta = a.Presente && (!entrada || !salida);
    const enCurso = incompleta && esDiaEnCurso(a.Fecha);
    // Jornada abierta sin horas guardadas:
    //  - día pasado (cerrado): estimar hasta 18:00
    //  - día en curso: cerrar a la hora actual (NO estima jornada completa)
    let horasCelda = h;
    if (incompleta && h === 0 && entrada) {
      const entMin = entrada.getHours() * 60 + entrada.getMinutes();
      const CIERRE = enCurso ? minutosDelDiaAhora() : 18 * 60;
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
      enCurso,
      retardo: esRetardo,
      minutosRetardo: esRetardo ? (a.Minutos_Retardo || 0) : 0,
      multiPlanta: a.Multi_Planta,
      planta: planta || null
    });
  }

  // Umbral de horas bajo el cual un día con checada se marca para revisión de RH.
  const UMBRAL_REVISION_HORAS = 2;
  const NOMBRES_DIA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  // Con filtro: solo empleados con al menos una jornada visible (planta/área permitida).
  const empleadosVisibles = filtro ? empleados.filter(e => empConDatos.has(e.ID_Empleado)) : empleados;

  const filas = empleadosVisibles.map(e => {
    const acc = porEmpleado.get(e.ID_Empleado) || { horas: 0, extras: 0, dias: 0, retardos: 0, multi: 0 };
    const horas = Math.round(acc.horas * 100) / 100;
    // Extra = excedente sobre 45h semanales (incluye sábado en el total).
    // Normal = lo trabajado hasta el tope de 45h.
    const extras = Math.max(0, Math.round((horas - LIMITE_SEMANAL_HORAS) * 100) / 100);
    const normales = Math.round((horas - extras) * 100) / 100;
    const jornada = e.tipo_horario?.Horas_Jornada || 8;
    const diasSemana = e.tipo_horario?.Dias_Semana || 6;

    // Matriz: una celda por cada fecha del rango
    const empDias = diasEmp.get(e.ID_Empleado);
    const revisiones = []; // días <2h que RH debe revisar
    let diasAusencia = 0; // vacaciones/permiso sin trabajar (no cuentan como falta)
    const celdas = fechas.map(f => {
      const key = f.toISOString().slice(0, 10);
      const c = empDias?.get(key);
      const esDomingo = f.getDay() === 0;
      // Etiqueta de vacaciones/permiso; la celda deja de ser "Falta".
      const ausencia = ausenciaEnFecha(ausencias, e.ID_Empleado, f);
      if (ausencia && !esDomingo && !(c && c.presente && c.horas > 0)) diasAusencia++;
      if (!c) return { presente: false, vacio: !esDomingo && !ausencia, esDomingo, ausencia };
      // Revisión: presente, día YA cerrado (no en curso), con checada, pero <2h.
      // Cubre olvido de entrada/salida (cierre a 23:59 da pocos minutos).
      const tieneChecada = !!(c.entrada || c.salida);
      const requiereRevision = c.presente && !c.enCurso && tieneChecada && c.horas < UMBRAL_REVISION_HORAS;
      if (requiereRevision) {
        revisiones.push({
          fecha: key,
          nombreDia: NOMBRES_DIA_CORTO[f.getDay()],
          horas: c.horas,
          entrada: c.entrada || null,
          salida: c.salida || null,
          motivo: !c.salida ? 'Falta salida' : (!c.entrada ? 'Falta entrada' : 'Jornada muy corta')
        });
      }
      return { ...c, esDomingo, ausencia, requiereRevision, jornadaCompleta: c.horas >= (jornada - 0.5) };
    });

    // Horas esperadas: descontar la jornada de los días de vacación/permiso.
    const esperadas = Math.max(0, jornada * diasSemana - jornada * diasAusencia);

    return {
      ID_Empleado: e.ID_Empleado,
      nombre: [e.Nombre, e.Apellido_Paterno, e.Apellido_Materno].filter(Boolean).join(' '),
      area: e.area?.Nombre_Area || '',
      puesto: e.puesto?.Nombre_Puesto || '',
      horas, extras, normales,
      dias: acc.dias, retardos: acc.retardos, multi: acc.multi,
      diasAusencia,
      esperadas,
      faltantes: Math.max(0, Math.round((esperadas - horas) * 100) / 100),
      celdas,
      revisiones,
      requiereRevision: revisiones.length > 0
    };
  });

  // Resumen global de revisiones (para banner/confirmación antes de descargar)
  const resumenRevisiones = filas
    .filter(f => f.requiereRevision)
    .map(f => ({
      ID_Empleado: f.ID_Empleado,
      nombre: f.nombre,
      area: f.area,
      dias: f.revisiones
    }));
  const totalRevisiones = resumenRevisiones.reduce((s, r) => s + r.dias.length, 0);

  const plantas = Array.from(porPlanta.entries())
    .map(([nombre, v]) => ({ nombre, horas: Math.round(v.horas * 100) / 100, dias: v.dias }))
    .sort((a, b) => b.horas - a.horas);

  return {
    periodo: { fechaInicio: inicio, fechaFin: fin },
    filas, plantas, fechas,
    revisiones: resumenRevisiones,
    totalRevisiones,
    umbralRevision: UMBRAL_REVISION_HORAS
  };
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
  plantaId = null,
  filtro = null
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
    // Filtro de visibilidad del consultor (unión planta/área).
    if (!asistenciaVisible({ idPlanta, idArea: asistencia.empleado?.ID_Area }, filtro)) continue;

    const bucket = buckets.get(idPlanta);
    bucket.empleados.add(asistencia.ID_Empleado);
    bucket.totalChecadas++;
    const entradaMostrar = entradaPagoDesde(asistencia.Hora_Entrada, asistencia.empleado);
    bucket.detalle.push({
      fecha: fechaLocalDB(asistencia.Fecha),
      empleado: {
        id: asistencia.empleado.ID_Empleado,
        nombre: `${asistencia.empleado.Nombre} ${asistencia.empleado.Apellido_Paterno}`,
        puesto: asistencia.empleado.puesto?.Nombre_Puesto,
        area: asistencia.empleado.area?.Nombre_Area
      },
      entrada: entradaMostrar || asistencia.Hora_Entrada,
      entradaReal: asistencia.Hora_Entrada,
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
    // Con filtro de consultor: ocultar plantas no permitidas y sin datos visibles.
    if (filtro && bucket.totalChecadas === 0 && !filtro.plantaIds.has(bucket.id)) continue;
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
 * Entrada a MOSTRAR (Date) a partir de la hora real de entrada y el empleado.
 * El redondeo a HH:00 NO se aplica aquí (lo hace el selector "Redondear horas").
 * Devuelve un Date del mismo día, o null si no hay entrada real.
 * @param {Date|null} horaEntradaReal
 * @param {Object} empleado con { area:{Nombre_Area}, puesto:{Nombre_Puesto} }
 */
export function entradaPagoDesde(horaEntradaReal, empleado) {
  if (!horaEntradaReal) return null;
  const d = new Date(horaEntradaReal);
  const { aplicaCobertura } = reglaToleranciaPorFecha(d);
  if (!aplicaCobertura) return d;
  const coberturaEspecial = esAreaCoberturaEspecial({ area: empleado?.area?.Nombre_Area, puesto: empleado?.puesto?.Nombre_Puesto });
  if (!coberturaEspecial) return d;
  const realMin = d.getHours() * 60 + d.getMinutes();
  const showMin = entradaCobertura(realMin).mostrarMin;
  const out = new Date(d);
  out.setHours(Math.floor(showMin / 60), showMin % 60, 0, 0);
  return out;
}

/**
 * ¿La entrada (ya mostrada/ajustada) implica retardo, según la tolerancia de esa fecha?
 * Deriva el retardo de la hora mostrada en vivo, para que coincida con lo que ve el usuario
 * (la entrada ajustada) sin depender del valor persistido en BD.
 * @param {Date|null} entradaMostrada hora de entrada ya ajustada (salida de entradaPagoDesde)
 * @param {Date} fecha fecha de la jornada (define la tolerancia aplicable)
 * @returns {boolean}
 */
export function hayRetardoEnEntrada(entradaMostrada, fecha) {
  if (!entradaMostrada) return false;
  const HORA_ENTRADA_MIN = 8 * 60; // 08:00
  const { toleranciaMin } = reglaToleranciaPorFecha(fecha);
  const d = new Date(entradaMostrada);
  const min = d.getHours() * 60 + d.getMinutes();
  return min > HORA_ENTRADA_MIN + toleranciaMin;
}

/**
 * Presencia EN VIVO por planta para una fecha (default hoy en TZ México).
 * "Presente ahora" = tiene entrada registrada y NO tiene salida ese día.
 *
 * @param {string|Date|null} fecha  YYYY-MM-DD o Date; null = hoy México
 * @returns {Promise<{fecha:string, plantas:Array, totalPresentes:number}>}
 */
export async function obtenerPresenciaPorPlanta(fecha = null, filtro = null) {
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
    if (!asistenciaVisible({ idPlanta, idArea: a.empleado?.ID_Area }, filtro)) continue;
    const entradaPago = entradaPagoDesde(a.Hora_Entrada, a.empleado);
    buckets.get(idPlanta).presentes.push({
      id: a.empleado.ID_Empleado,
      nombre: `${a.empleado.Nombre} ${a.empleado.Apellido_Paterno} ${a.empleado.Apellido_Materno || ''}`.trim(),
      puesto: a.empleado.puesto?.Nombre_Puesto,
      area: a.empleado.area?.Nombre_Area,
      entrada: entradaPago || a.Hora_Entrada,
      entradaReal: a.Hora_Entrada,
      retardo: hayRetardoEnEntrada(entradaPago, fechaLocalDB(a.Fecha))
    });
    totalPresentes++;
  }

  const resultado = [];
  for (const b of buckets.values()) {
    if (b.id === SIN_PLANTA && b.presentes.length === 0) continue;
    // Con filtro de consultor: ocultar plantas no permitidas que no tengan presentes
    // visibles (por área). Se muestra la planta si está en su lista O tiene presentes.
    if (filtro && b.presentes.length === 0 && !filtro.plantaIds.has(b.id)) continue;
    // Ordenar por la hora mostrada (puede venir ajustada) para coherencia visual.
    b.presentes.sort((x, y) => new Date(x.entrada) - new Date(y.entrada));
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
export async function obtenerChecadasDelDia(fecha = null, plantaId = null, filtro = null) {
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
              ID_Empleado: true, ID_Area: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true,
              area: { select: { Nombre_Area: true } },
              puesto: { select: { Nombre_Puesto: true } }
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
  const primeraChecadaPorEmp = new Map(); // ID_Empleado -> ID_Checada de la 1ª conservada
  for (const c of checadas) {
    const empId = c.asistencia?.empleado?.ID_Empleado;
    if (empId == null) continue;
    const min = minutosDelDia(c.Fecha_Hora);
    const ult = ultimaConservadaPorEmp.get(empId);
    if (ult != null && min - ult < VENTANA_MIN) {
      dobles.add(c.ID_Checada); // dentro de la ventana -> doble, ignorada
    } else {
      if (!primeraChecadaPorEmp.has(empId)) primeraChecadaPorEmp.set(empId, c.ID_Checada);
      ultimaConservadaPorEmp.set(empId, min); // conservada -> reinicia ventana
    }
  }

  const filas = [];
  for (const c of checadas) {
    const idPlanta = c.checador?.ID_Planta ?? null;
    if (plantaId && idPlanta !== plantaId) continue;
    const emp = c.asistencia?.empleado;
    if (!asistenciaVisible({ idPlanta, idArea: emp?.ID_Area }, filtro)) continue;
    const esEntrada = emp && primeraChecadaPorEmp.get(emp.ID_Empleado) === c.ID_Checada;
    const horaMostrar = esEntrada
      ? (entradaPagoDesde(c.Fecha_Hora, { area: emp.area, puesto: emp.puesto }) || c.Fecha_Hora)
      : c.Fecha_Hora;
    filas.push({
      hora: horaMostrar,
      horaReal: c.Fecha_Hora,
      tipo: c.Tipo_Checada,
      estado: c.Estado,
      jornadaRetardo: esEntrada ? hayRetardoEnEntrada(horaMostrar, new Date(c.Fecha_Hora)) : (c.asistencia?.Retardo || false),
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

  // Ordenar por la hora MOSTRADA (la entrada puede mostrarse ajustada), para que el orden
  // visual coincida con las horas que se ven y no queden filas descolocadas.
  filas.sort((a, b) => new Date(a.hora) - new Date(b.hora));

  return { fecha: fechaStr, checadas: filas, total: filas.length };
}

/**
 * Obtiene el resumen diario de asistencia
 */
export async function obtenerResumenDiario(fecha = new Date(), filtro = null) {
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

  // Filtro de visibilidad del consultor (unión planta/área).
  let asistenciasVisibles = asistencias;
  if (filtro) {
    const plantasCat = await prisma.cat_Plantas.findMany({ select: { ID_Planta: true, Nombre: true } });
    const chks = await prisma.checadores.findMany({ select: { ID_Planta: true, Ubicacion_Codigo: true } });
    const strAPlanta = new Map();
    for (const pl of plantasCat) strAPlanta.set(normalizarUbicacion(pl.Nombre), pl.ID_Planta);
    for (const c of chks) if (c.Ubicacion_Codigo) strAPlanta.set(normalizarUbicacion(c.Ubicacion_Codigo), c.ID_Planta);
    asistenciasVisibles = asistencias.filter(a => {
      const idPlanta = strAPlanta.get(normalizarUbicacion(a.Ubicacion_Entrada || a.Ubicacion_Salida)) ?? null;
      return asistenciaVisible({ idPlanta, idArea: a.empleado?.ID_Area }, filtro);
    });
  }

  // Obtener total de empleados activos
  const totalEmpleadosActivos = await prisma.empleados.count({
    where: {
      estatus: {
        is: { Nombre_Estatus: 'ACTIVO' }
      }
    }
  });

  // Retardo derivado de la entrada mostrada (ajustada), coherente con lo que se ve.
  const tieneRetardo = a => a.Presente && hayRetardoEnEntrada(
    entradaPagoDesde(a.Hora_Entrada, a.empleado) || a.Hora_Entrada, fechaLocalDB(a.Fecha)
  );
  const presentes = asistenciasVisibles.filter(a => a.Presente);
  const conEntrada = asistenciasVisibles.filter(a => a.Hora_Entrada);
  const conSalida = asistenciasVisibles.filter(a => a.Hora_Salida);
  const conRetardo = asistenciasVisibles.filter(tieneRetardo);

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
    detalle: asistenciasVisibles.map(a => ({
      empleadoId: a.ID_Empleado,
      nombreCompleto: `${a.empleado.Nombre} ${a.empleado.Apellido_Paterno} ${a.empleado.Apellido_Materno || ''}`.trim(),
      puesto: a.empleado.puesto?.Nombre_Puesto,
      area: a.empleado.area?.Nombre_Area,
      presente: a.Presente,
      horaEntrada: entradaPagoDesde(a.Hora_Entrada, a.empleado) || a.Hora_Entrada,
      horaEntradaReal: a.Hora_Entrada,
      horaSalida: a.Hora_Salida,
      retardo: tieneRetardo(a),
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
  // Columnas @db.Date se leen a medianoche UTC: comparar contra la medianoche
  // UTC del mismo día calendario (con fechaProcesar local, el último día del
  // periodo quedaba fuera del gte y generaba falta).
  const diaUTC = new Date(Date.UTC(
    fechaProcesar.getFullYear(), fechaProcesar.getMonth(), fechaProcesar.getDate()
  ));
  for (const empleado of empleadosSinAsistencia) {
    // Sin falta si tiene incidencia aprobada O vacaciones en curso/tomadas ese día.
    const [incidenciaJustificada, vacacion] = await Promise.all([
      prisma.empleados_Incidencias.findFirst({
        where: {
          ID_Empleado: empleado.ID_Empleado,
          Fecha_Inicio: { lte: diaUTC },
          Fecha_Fin: { gte: diaUTC },
          Estado: 'APROBADA'
        }
      }),
      prisma.vacaciones.findFirst({
        where: {
          ID_Empleado: empleado.ID_Empleado,
          Estado: { in: ['EN_CURSO', 'TOMADAS'] },
          Fecha_Inicio: { lte: diaUTC },
          Fecha_Fin: { gte: diaUTC }
        }
      })
    ]);

    if (!incidenciaJustificada && !vacacion) {
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
  obtenerAusenciasJustificadas,
  ausenciaEnFecha,
  UBICACIONES
};
