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
      Estatus: true
    }
  });

  if (!empleado) {
    throw new Error('Empleado no encontrado');
  }

  if (empleado.Estatus?.Nombre !== 'Activo') {
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
        datosActualizacion.Retardo = true;
        datosActualizacion.Minutos_Retardo = estadoChecada.minutosRetardo;
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
        
        // Calcular horas trabajadas
        const entrada = new Date(asistencia.Hora_Entrada);
        const salida = new Date(asistencia.Hora_Salida);
        const diffMs = salida - entrada;
        const horasTrabajadas = diffMs / (1000 * 60 * 60);
        // Restar 1 hora de comida
        resumen.horasTrabajadas += Math.max(0, horasTrabajadas - 1);
      }
      
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
 * Obtiene el reporte de asistencia por ubicación (RAM1/RAM2)
 */
export async function obtenerReportePorUbicacion({
  fechaInicio,
  fechaFin,
  ubicacion = null // null = ambas
}) {
  const whereClause = {
    Fecha: {
      gte: fechaInicio,
      lte: fechaFin
    },
    Presente: true
  };

  const asistencias = await prisma.empleados_Asistencia.findMany({
    where: whereClause,
    include: {
      Empleado: {
        include: {
          Puesto: true,
          Area: true
        }
      }
    },
    orderBy: [
      { Fecha: 'asc' },
      { Empleado: { Nombre: 'asc' } }
    ]
  });

  const porUbicacion = {
    RAM1: {
      empleados: new Set(),
      totalChecadas: 0,
      detalle: []
    },
    RAM2: {
      empleados: new Set(),
      totalChecadas: 0,
      detalle: []
    }
  };

  for (const asistencia of asistencias) {
    // Determinar ubicación (priorizar entrada, luego salida)
    const ubi = asistencia.Ubicacion_Entrada || asistencia.Ubicacion_Salida;
    
    if (ubi && porUbicacion[ubi]) {
      // Filtrar por ubicación si se especificó
      if (ubicacion && ubi !== ubicacion) continue;
      
      porUbicacion[ubi].empleados.add(asistencia.ID_Empleado);
      porUbicacion[ubi].totalChecadas++;
      porUbicacion[ubi].detalle.push({
        fecha: asistencia.Fecha,
        empleado: {
          id: asistencia.Empleado.ID_Empleado,
          nombre: `${asistencia.Empleado.Nombre} ${asistencia.Empleado.Apellido_Paterno}`,
          puesto: asistencia.Empleado.Puesto?.Nombre,
          area: asistencia.Empleado.Area?.Nombre
        },
        entrada: asistencia.Hora_Entrada,
        salida: asistencia.Hora_Salida,
        ubicacionEntrada: asistencia.Ubicacion_Entrada,
        ubicacionSalida: asistencia.Ubicacion_Salida
      });
    }
  }

  // Convertir Sets a conteo
  return {
    periodo: { fechaInicio, fechaFin },
    RAM1: {
      totalEmpleados: porUbicacion.RAM1.empleados.size,
      totalChecadas: porUbicacion.RAM1.totalChecadas,
      detalle: ubicacion === 'RAM2' ? [] : porUbicacion.RAM1.detalle
    },
    RAM2: {
      totalEmpleados: porUbicacion.RAM2.empleados.size,
      totalChecadas: porUbicacion.RAM2.totalChecadas,
      detalle: ubicacion === 'RAM1' ? [] : porUbicacion.RAM2.detalle
    }
  };
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
      Empleado: {
        include: {
          Puesto: true,
          Area: true
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
      Estatus: {
        Nombre: 'Activo'
      }
    }
  });

  const presentes = asistencias.filter(a => a.Presente);
  const conEntrada = asistencias.filter(a => a.Hora_Entrada);
  const conSalida = asistencias.filter(a => a.Hora_Salida);
  const conRetardo = asistencias.filter(a => a.Retardo);

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
    porUbicacion: {
      RAM1: asistencias.filter(a => a.Ubicacion_Entrada === 'RAM1').length,
      RAM2: asistencias.filter(a => a.Ubicacion_Entrada === 'RAM2').length
    },
    detalle: asistencias.map(a => ({
      empleadoId: a.ID_Empleado,
      nombreCompleto: `${a.Empleado.Nombre} ${a.Empleado.Apellido_Paterno} ${a.Empleado.Apellido_Materno || ''}`.trim(),
      puesto: a.Empleado.Puesto?.Nombre,
      area: a.Empleado.Area?.Nombre,
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
      Estatus: {
        Nombre: 'Activo'
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
        Estatus: 'APROBADA'
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
  obtenerResumenDiario,
  marcarFaltasAutomaticas,
  UBICACIONES
};
