/**
 * Controlador de Asistencia - RAM
 * Manejo de checadas biométricas y reportes de asistencia
 */

import prisma from '../config/database.js';
import * as asistenciaService from '../services/asistenciaService.js';
import * as nominaService from '../services/nominaService.js';
import { generarExcelHoras } from '../services/excelHorasService.js';

// ============================================================
// VISTAS (EJS)
// ============================================================

/**
 * Dashboard de asistencia
 */
export const index = async (req, res, next) => {
  try {
    const filtro = await asistenciaService.getFiltroVisibilidad(req.user);
    // Obtener resumen del día actual
    const resumenHoy = await asistenciaService.obtenerResumenDiario(new Date(), filtro);
    
    // Obtener últimas checadas. Con filtro de consultor traemos más y recortamos a 20
    // tras filtrar por planta/área visibles.
    let ultimasChecadas = [];
    try {
      ultimasChecadas = await prisma.historial_Checadas.findMany({
        take: filtro ? 200 : 20,
        orderBy: { Fecha_Hora: 'desc' },
        include: {
          checador: { select: { ID_Planta: true } },
          asistencia: {
            include: {
              empleado: {
                select: {
                  ID_Empleado: true,
                  ID_Area: true,
                  Nombre: true,
                  Apellido_Paterno: true,
                  Apellido_Materno: true,
                  area: { select: { Nombre_Area: true } },
                  puesto: { select: { Nombre_Puesto: true } }
                }
              }
            }
          }
        }
      });
      // Filtro de visibilidad del consultor (unión planta/área).
      if (filtro) {
        ultimasChecadas = ultimasChecadas
          .filter(c => asistenciaService.asistenciaVisible(
            { idPlanta: c.checador?.ID_Planta ?? null, idArea: c.asistencia?.empleado?.ID_Area }, filtro))
          .slice(0, 20);
      }
      // La checada ENTRADA muestra la hora ajustada; la real se conserva en Fecha_Hora_Real.
      ultimasChecadas = ultimasChecadas.map(c => {
        if (c.Tipo_Checada !== 'ENTRADA') return c;
        const emp = c.asistencia?.empleado;
        const ajustada = asistenciaService.entradaPagoDesde(c.Fecha_Hora, emp);
        return ajustada ? { ...c, Fecha_Hora: ajustada, Fecha_Hora_Real: c.Fecha_Hora } : c;
      });
    } catch (e) {
      // Tabla puede no existir aún si no se ha corrido la migración
    }

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
    const inicio = fechaInicio ? new Date(`${fechaInicio}T00:00:00`) : semana.lunes;
    const fin = fechaFin ? new Date(`${fechaFin}T00:00:00`) : semana.sabado;
    
    const empleado = await prisma.empleados.findUnique({
      where: { ID_Empleado: parseInt(id) },
      include: {
        puesto: true,
        area: true,
        estatus: true
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
 * Tabla global de horas semanales de todos los empleados.
 * GET /asistencia/horas
 */
export const horasTodos = async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin, redondear } = req.query;
    const semana = nominaService.getSemanaActual();
    // 'YYYY-MM-DD' se parsea con hora local (T00:00:00) para no desplazarse -1 día por UTC.
    const inicio = fechaInicio ? new Date(`${fechaInicio}T00:00:00`) : semana.lunes;
    const fin = fechaFin ? new Date(`${fechaFin}T00:00:00`) : semana.sabado;

    const filtro = await asistenciaService.getFiltroVisibilidad(req.user);
    const datos = await asistenciaService.obtenerHorasSemanalTodos(inicio, fin, filtro);

    res.render('asistencia/horas-todos', {
      title: 'Consultar Horas',
      datos,
      fechaInicio: inicio.toISOString().split('T')[0],
      fechaFin: fin.toISOString().split('T')[0],
      redondear: redondear === '1',
      user: req.user
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Descarga Excel de horas (matriz empleados × días) para un rango.
 * GET /asistencia/horas/excel?fechaInicio=&fechaFin=
 */
export const descargarHorasExcel = async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin, sort, dir, redondear } = req.query;
    const semana = nominaService.getSemanaActual();
    const inicio = fechaInicio ? new Date(`${fechaInicio}T00:00:00`) : semana.lunes;
    const fin = fechaFin ? new Date(`${fechaFin}T00:00:00`) : semana.sabado;

    const filtro = await asistenciaService.getFiltroVisibilidad(req.user);
    const buffer = await generarExcelHoras(inicio, fin, { sort, dir, redondear: redondear === '1', filtro });

    const f1 = inicio.toISOString().slice(0, 10);
    const f2 = fin.toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="horas_${f1}_a_${f2}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

/**
 * Desglose de horas por día y semana de un empleado (desde checadas reales BD).
 * GET /asistencia/horas/:id
 */
export const desgloseHoras = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fechaInicio, fechaFin } = req.query;

    const semana = nominaService.getSemanaActual();
    const inicio = fechaInicio ? new Date(`${fechaInicio}T00:00:00`) : semana.lunes;
    const fin = fechaFin ? new Date(`${fechaFin}T00:00:00`) : semana.sabado;

    const empleado = await prisma.empleados.findUnique({
      where: { ID_Empleado: parseInt(id) },
      include: { puesto: true, area: true, tipo_horario: true }
    });
    if (!empleado) {
      req.flash('error', 'Empleado no encontrado');
      return res.redirect('/asistencia');
    }

    const desglose = await asistenciaService.obtenerDesgloseHoras(parseInt(id), inicio, fin);

    res.render('asistencia/horas', {
      title: `Horas - ${empleado.Nombre} ${empleado.Apellido_Paterno}`,
      empleado,
      desglose,
      fechaInicio: inicio.toISOString().split('T')[0],
      fechaFin: fin.toISOString().split('T')[0],
      user: req.user
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reporte por ubicación (dinámico desde Cat_Plantas)
 */
export const reporteUbicacion = async (req, res, next) => {
  try {
    const { planta, fechaInicio, fechaFin } = req.query;
    const plantaId = planta ? parseInt(planta) : null;

    const semana = nominaService.getSemanaActual();
    const inicio = fechaInicio ? new Date(`${fechaInicio}T00:00:00`) : semana.lunes;
    const fin = fechaFin ? new Date(`${fechaFin}T00:00:00`) : semana.sabado;

    const filtro = await asistenciaService.getFiltroVisibilidad(req.user);
    const [reporte, plantasCat] = await Promise.all([
      asistenciaService.obtenerReportePorUbicacion({
        fechaInicio: inicio,
        fechaFin: fin,
        plantaId,
        filtro
      }),
      prisma.cat_Plantas.findMany({
        where: { Activo: true },
        orderBy: { ID_Planta: 'asc' },
        select: { ID_Planta: true, Nombre: true }
      })
    ]);
    // Selector de plantas: con filtro, solo las plantas que el consultor puede ver.
    const plantas = filtro
      ? plantasCat.filter(p => filtro.plantaIds.has(p.ID_Planta) || reporte.plantas.some(rp => rp.id === p.ID_Planta))
      : plantasCat;

    res.render('asistencia/por-ubicacion', {
      title: 'Reporte por Ubicación',
      reporte,
      plantas,
      plantaSeleccionada: plantaId,
      fechaInicio: inicio.toISOString().split('T')[0],
      fechaFin: fin.toISOString().split('T')[0],
      user: req.user
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Desglose completo del día: presencia en vivo por planta + tabla cronológica.
 * GET /asistencia/dia?fecha=YYYY-MM-DD&planta=ID
 */
export const desgloseDia = async (req, res, next) => {
  try {
    const { fecha, planta } = req.query;
    const plantaId = planta ? parseInt(planta) : null;

    const filtro = await asistenciaService.getFiltroVisibilidad(req.user);
    const [presencia, dia, plantasCat] = await Promise.all([
      asistenciaService.obtenerPresenciaPorPlanta(fecha || null, filtro),
      asistenciaService.obtenerChecadasDelDia(fecha || null, plantaId, filtro),
      prisma.cat_Plantas.findMany({
        where: { Activo: true },
        orderBy: { ID_Planta: 'asc' },
        select: { ID_Planta: true, Nombre: true }
      })
    ]);
    // Selector de plantas: con filtro, solo las que el consultor puede ver.
    const plantas = filtro
      ? plantasCat.filter(p => filtro.plantaIds.has(p.ID_Planta) || (presencia.plantas || []).some(pp => pp.id === p.ID_Planta))
      : plantasCat;

    res.render('asistencia/dia', {
      title: 'Desglose del Día',
      presencia,
      dia,
      plantas,
      plantaSeleccionada: plantaId,
      fecha: dia.fecha,
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
        estatus: { is: { Nombre_Estatus: 'ACTIVO' } }
      },
      orderBy: { Nombre: 'asc' },
      select: {
        ID_Empleado: true,
        Nombre: true,
        Apellido_Paterno: true,
        Apellido_Materno: true
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

    const filtro = await asistenciaService.getFiltroVisibilidad(req.user);
    const resumen = await asistenciaService.obtenerResumenDiario(fechaConsulta, filtro);
    
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
    const inicio = fechaInicio ? new Date(`${fechaInicio}T00:00:00`) : semana.lunes;
    const fin = fechaFin ? new Date(`${fechaFin}T00:00:00`) : semana.sabado;
    
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
    const { planta, fechaInicio, fechaFin } = req.query;

    const semana = nominaService.getSemanaActual();
    const inicio = fechaInicio ? new Date(`${fechaInicio}T00:00:00`) : semana.lunes;
    const fin = fechaFin ? new Date(`${fechaFin}T00:00:00`) : semana.sabado;

    const filtro = await asistenciaService.getFiltroVisibilidad(req.user);
    const reporte = await asistenciaService.obtenerReportePorUbicacion({
      fechaInicio: inicio,
      fechaFin: fin,
      plantaId: planta ? parseInt(planta) : null,
      filtro
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
  desgloseDia,
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
