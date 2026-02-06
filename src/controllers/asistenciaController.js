/**
 * Controlador de Asistencia - RAM
 * Manejo de checadas biométricas y reportes de asistencia
 */

import prisma from '../config/database.js';
import asistenciaService from '../services/asistenciaService.js';
import nominaService from '../services/nominaService.js';

// ============================================================
// VISTAS (EJS)
// ============================================================

/**
 * Dashboard de asistencia
 */
export const index = async (req, res, next) => {
  try {
    // Obtener resumen del día actual
    const resumenHoy = await asistenciaService.obtenerResumenDiario();
    
    // Obtener últimas checadas
    const ultimasChecadas = await prisma.historial_Checadas.findMany({
      take: 20,
      orderBy: { Fecha_Hora: 'desc' },
      include: {
        asistencia: {
          include: {
            empleado: {
              select: {
                ID_Empleado: true,
                Nombre: true,
                Apellido_Paterno: true,
                Apellido_Materno: true,
                Numero_Empleado: true
              }
            }
          }
        }
      }
    });

    res.render('asistencia/index', {
      title: 'Control de Asistencia',
      resumen: resumenHoy,
      ultimasChecadas,
      user: req.user
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reporte de asistencia por empleado
 */
export const reporteEmpleado = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fechaInicio, fechaFin } = req.query;
    
    // Defaults: semana actual
    const semana = nominaService.getSemanaActual();
    const inicio = fechaInicio ? new Date(fechaInicio) : semana.lunes;
    const fin = fechaFin ? new Date(fechaFin) : semana.sabado;
    
    const empleado = await prisma.empleados.findUnique({
      where: { ID_Empleado: parseInt(id) },
      include: {
        Puesto: true,
        Area: true,
        Estatus: true
      }
    });

    if (!empleado) {
      req.flash('error', 'Empleado no encontrado');
      return res.redirect('/asistencia');
    }

    const resumen = await asistenciaService.obtenerResumenAsistencia({
      empleadoId: parseInt(id),
      fechaInicio: inicio,
      fechaFin: fin
    });

    res.render('asistencia/empleado', {
      title: `Asistencia - ${empleado.Nombre} ${empleado.Apellido_Paterno}`,
      empleado,
      resumen,
      fechaInicio: inicio.toISOString().split('T')[0],
      fechaFin: fin.toISOString().split('T')[0],
      user: req.user
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reporte por ubicación (RAM1/RAM2)
 */
export const reporteUbicacion = async (req, res, next) => {
  try {
    const { ubicacion, fechaInicio, fechaFin } = req.query;
    
    const semana = nominaService.getSemanaActual();
    const inicio = fechaInicio ? new Date(fechaInicio) : semana.lunes;
    const fin = fechaFin ? new Date(fechaFin) : semana.sabado;

    const reporte = await asistenciaService.obtenerReportePorUbicacion({
      fechaInicio: inicio,
      fechaFin: fin,
      ubicacion: ubicacion || null
    });

    res.render('asistencia/por-ubicacion', {
      title: 'Reporte por Ubicación',
      reporte,
      ubicacionSeleccionada: ubicacion || 'TODAS',
      fechaInicio: inicio.toISOString().split('T')[0],
      fechaFin: fin.toISOString().split('T')[0],
      user: req.user
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Formulario para registrar checada manual
 */
export const formChecadaManual = async (req, res, next) => {
  try {
    const empleados = await prisma.empleados.findMany({
      where: {
        Estatus: { Nombre: 'Activo' }
      },
      orderBy: { Nombre: 'asc' },
      select: {
        ID_Empleado: true,
        Nombre: true,
        Apellido_Paterno: true,
        Apellido_Materno: true,
        Numero_Empleado: true
      }
    });

    res.render('asistencia/checada-manual', {
      title: 'Registrar Checada Manual',
      empleados,
      user: req.user
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Registrar checada manual (POST)
 */
export const registrarChecadaManual = async (req, res, next) => {
  try {
    const { empleadoId, tipoChecada, ubicacion, fecha, hora } = req.body;
    
    // Combinar fecha y hora
    const fechaHora = new Date(`${fecha}T${hora}`);
    
    const resultado = await asistenciaService.registrarChecada({
      empleadoId: parseInt(empleadoId),
      tipoChecada,
      ubicacion,
      fechaHora,
      dispositivo: 'MANUAL'
    });

    req.flash('success', `Checada registrada: ${resultado.empleado.nombre} - ${tipoChecada}`);
    res.redirect('/asistencia');
  } catch (error) {
    req.flash('error', error.message);
    res.redirect('/asistencia/checada-manual');
  }
};

// ============================================================
// API PARA SISTEMA BIOMÉTRICO
// ============================================================

/**
 * API: Registrar checada desde dispositivo biométrico
 * POST /api/asistencia/checada
 */
export const apiRegistrarChecada = async (req, res) => {
  try {
    const { 
      empleadoId, 
      tipoChecada, 
      ubicacion, 
      dispositivo,
      timestamp
    } = req.body;

    // Validaciones básicas
    if (!empleadoId || !tipoChecada || !ubicacion) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: empleadoId, tipoChecada, ubicacion'
      });
    }

    // Validar tipo de checada (solo entrada/salida, comida es dentro de la empresa)
    const tiposValidos = ['ENTRADA', 'SALIDA'];
    if (!tiposValidos.includes(tipoChecada)) {
      return res.status(400).json({
        success: false,
        error: `Tipo de checada inválido. Valores válidos: ${tiposValidos.join(', ')}`
      });
    }

    // Validar ubicación
    const ubicacionesValidas = ['RAM1', 'RAM2'];
    if (!ubicacionesValidas.includes(ubicacion)) {
      return res.status(400).json({
        success: false,
        error: `Ubicación inválida. Valores válidos: ${ubicacionesValidas.join(', ')}`
      });
    }

    const fechaHora = timestamp ? new Date(timestamp) : new Date();

    const resultado = await asistenciaService.registrarChecada({
      empleadoId: parseInt(empleadoId),
      tipoChecada,
      ubicacion,
      fechaHora,
      dispositivo
    });

    res.json({
      success: true,
      data: resultado
    });
  } catch (error) {
    console.error('Error en API checada:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * API: Obtener resumen diario
 * GET /api/asistencia/resumen-diario
 */
export const apiResumenDiario = async (req, res) => {
  try {
    const { fecha } = req.query;
    const fechaConsulta = fecha ? new Date(fecha) : new Date();
    
    const resumen = await asistenciaService.obtenerResumenDiario(fechaConsulta);
    
    res.json({
      success: true,
      data: resumen
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * API: Obtener asistencia de un empleado
 * GET /api/asistencia/empleado/:id
 */
export const apiAsistenciaEmpleado = async (req, res) => {
  try {
    const { id } = req.params;
    const { fechaInicio, fechaFin } = req.query;
    
    const semana = nominaService.getSemanaActual();
    const inicio = fechaInicio ? new Date(fechaInicio) : semana.lunes;
    const fin = fechaFin ? new Date(fechaFin) : semana.sabado;
    
    const resumen = await asistenciaService.obtenerResumenAsistencia({
      empleadoId: parseInt(id),
      fechaInicio: inicio,
      fechaFin: fin
    });
    
    res.json({
      success: true,
      data: resumen
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * API: Verificar estado de bono de puntualidad
 * GET /api/asistencia/bono-puntualidad/:id
 */
export const apiBonoPuntualidad = async (req, res) => {
  try {
    const { id } = req.params;
    const semana = nominaService.getSemanaActual();
    
    const resultado = await nominaService.evaluarPuntualidad({
      empleadoId: parseInt(id),
      fechaInicio: semana.lunes,
      fechaFin: semana.sabado
    });
    
    res.json({
      success: true,
      data: resultado
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * API: Obtener reporte por ubicación
 * GET /api/asistencia/por-ubicacion
 */
export const apiReportePorUbicacion = async (req, res) => {
  try {
    const { ubicacion, fechaInicio, fechaFin } = req.query;
    
    const semana = nominaService.getSemanaActual();
    const inicio = fechaInicio ? new Date(fechaInicio) : semana.lunes;
    const fin = fechaFin ? new Date(fechaFin) : semana.sabado;
    
    const reporte = await asistenciaService.obtenerReportePorUbicacion({
      fechaInicio: inicio,
      fechaFin: fin,
      ubicacion: ubicacion || null
    });
    
    res.json({
      success: true,
      data: reporte
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * API: Marcar faltas automáticamente
 * POST /api/asistencia/marcar-faltas
 */
export const apiMarcarFaltas = async (req, res) => {
  try {
    const { fecha } = req.body;
    
    const resultado = await asistenciaService.marcarFaltasAutomaticas(
      fecha ? new Date(fecha) : null
    );
    
    res.json({
      success: true,
      data: resultado
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * API: Sincronizar con dispositivo biométrico
 * Esta función está diseñada para recibir lotes de checadas
 * POST /api/asistencia/sincronizar
 */
export const apiSincronizar = async (req, res) => {
  try {
    const { checadas, dispositivo, ubicacion } = req.body;
    
    if (!Array.isArray(checadas) || checadas.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere un array de checadas'
      });
    }

    const resultados = {
      procesadas: 0,
      exitosas: 0,
      errores: []
    };

    for (const checada of checadas) {
      resultados.procesadas++;
      
      try {
        await asistenciaService.registrarChecada({
          empleadoId: parseInt(checada.empleadoId),
          tipoChecada: checada.tipoChecada,
          ubicacion: checada.ubicacion || ubicacion,
          fechaHora: new Date(checada.timestamp),
          dispositivo: checada.dispositivo || dispositivo
        });
        resultados.exitosas++;
      } catch (error) {
        resultados.errores.push({
          checada,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      data: resultados
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export default {
  // Vistas
  index,
  reporteEmpleado,
  reporteUbicacion,
  formChecadaManual,
  registrarChecadaManual,
  
  // API
  apiRegistrarChecada,
  apiResumenDiario,
  apiAsistenciaEmpleado,
  apiBonoPuntualidad,
  apiReportePorUbicacion,
  apiMarcarFaltas,
  apiSincronizar
};
