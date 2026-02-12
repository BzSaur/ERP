/**
 * Controlador de Auditoría - RAM ERP
 * Permite a SUPER_ADMIN ver historial de cambios realizados por ADMIN y RH
 */

import prisma from '../config/database.js';
import logger from '../config/logger.js';

/**
 * Vista principal del historial de cambios
 */
export async function index(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const skip = (page - 1) * limit;

    // Filtros
    const filtros = {
      usuario: req.query.usuario || '',
      accion: req.query.accion || '',
      tabla: req.query.tabla || '',
      fechaDesde: req.query.fechaDesde || '',
      fechaHasta: req.query.fechaHasta || ''
    };

    // Construir where clause
    const where = {};

    if (filtros.usuario) {
      where.Email_Usuario = { contains: filtros.usuario, mode: 'insensitive' };
    }

    if (filtros.accion) {
      where.Accion = filtros.accion;
    }

    if (filtros.tabla) {
      where.Tabla = { contains: filtros.tabla, mode: 'insensitive' };
    }

    if (filtros.fechaDesde || filtros.fechaHasta) {
      where.FechaHora = {};
      if (filtros.fechaDesde) {
        where.FechaHora.gte = new Date(filtros.fechaDesde + 'T00:00:00');
      }
      if (filtros.fechaHasta) {
        where.FechaHora.lte = new Date(filtros.fechaHasta + 'T23:59:59');
      }
    }

    // Obtener registros y total
    const [cambios, total] = await Promise.all([
      prisma.bitacora_Cambios.findMany({
        where,
        include: {
          usuario: {
            select: {
              ID_Usuario: true,
              Email_Office365: true,
              Nombre_Completo: true,
              rol: {
                select: {
                  Nombre_Rol: true
                }
              }
            }
          }
        },
        orderBy: { FechaHora: 'desc' },
        skip,
        take: limit
      }),
      prisma.bitacora_Cambios.count({ where })
    ]);

    // Obtener listas para filtros
    const [usuarios, tablas] = await Promise.all([
      prisma.bitacora_Cambios.findMany({
        distinct: ['Email_Usuario'],
        select: { Email_Usuario: true, Rol_Usuario: true }
      }),
      prisma.bitacora_Cambios.findMany({
        distinct: ['Tabla'],
        select: { Tabla: true }
      })
    ]);

    const totalPages = Math.ceil(total / limit);

    res.render('auditoria/index', {
      title: 'Historial de Cambios',
      cambios,
      usuarios,
      tablas,
      filtros,
      pagination: {
        page,
        totalPages,
        total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    logger.error(`Error en auditoría index: ${error.message}`);
    req.flash('error', 'Error al cargar el historial de cambios');
    res.redirect('/');
  }
}

/**
 * Ver detalle de un cambio específico
 */
export async function detalle(req, res) {
  try {
    const { id } = req.params;

    const cambio = await prisma.bitacora_Cambios.findUnique({
      where: { ID_Cambio: parseInt(id) },
      include: {
        usuario: {
          select: {
            ID_Usuario: true,
            Email_Office365: true,
            Nombre_Completo: true,
            rol: {
              select: {
                Nombre_Rol: true
              }
            }
          }
        }
      }
    });

    if (!cambio) {
      req.flash('error', 'Registro no encontrado');
      return res.redirect('/auditoria');
    }

    res.render('auditoria/detalle', {
      title: 'Detalle de Cambio',
      cambio
    });
  } catch (error) {
    logger.error(`Error en auditoría detalle: ${error.message}`);
    req.flash('error', 'Error al cargar el detalle del cambio');
    res.redirect('/auditoria');
  }
}

/**
 * Exportar historial de cambios a CSV
 */
export async function exportarCSV(req, res) {
  try {
    // Aplicar los mismos filtros que en la vista principal
    const filtros = {
      usuario: req.query.usuario || '',
      accion: req.query.accion || '',
      tabla: req.query.tabla || '',
      fechaDesde: req.query.fechaDesde || '',
      fechaHasta: req.query.fechaHasta || ''
    };

    const where = {};
    if (filtros.usuario) {
      where.Email_Usuario = { contains: filtros.usuario, mode: 'insensitive' };
    }
    if (filtros.accion) {
      where.Accion = filtros.accion;
    }
    if (filtros.tabla) {
      where.Tabla = { contains: filtros.tabla, mode: 'insensitive' };
    }
    if (filtros.fechaDesde || filtros.fechaHasta) {
      where.FechaHora = {};
      if (filtros.fechaDesde) {
        where.FechaHora.gte = new Date(filtros.fechaDesde + 'T00:00:00');
      }
      if (filtros.fechaHasta) {
        where.FechaHora.lte = new Date(filtros.fechaHasta + 'T23:59:59');
      }
    }

    const cambios = await prisma.bitacora_Cambios.findMany({
      where,
      orderBy: { FechaHora: 'desc' },
      take: 5000 // Límite de 5000 registros para exportación
    });

    // Generar CSV
    let csv = 'ID,Fecha,Hora,Usuario,Rol,Acción,Tabla,ID Registro,Descripción,IP\n';
    
    cambios.forEach(cambio => {
      const fecha = new Date(cambio.FechaHora);
      const fechaStr = fecha.toLocaleDateString('es-MX');
      const horaStr = fecha.toLocaleTimeString('es-MX');
      
      csv += `${cambio.ID_Cambio},`;
      csv += `${fechaStr},`;
      csv += `${horaStr},`;
      csv += `"${cambio.Email_Usuario}",`;
      csv += `"${cambio.Rol_Usuario}",`;
      csv += `${cambio.Accion},`;
      csv += `"${cambio.Tabla}",`;
      csv += `${cambio.ID_Registro},`;
      csv += `"${cambio.Descripcion.replace(/"/g, '""')}",`;
      csv += `${cambio.IP_Usuario || 'N/A'}\n`;
    });

    // Enviar archivo
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=historial_cambios_${Date.now()}.csv`);
    res.send('\uFEFF' + csv); // BOM para UTF-8
  } catch (error) {
    logger.error(`Error exportando auditoría: ${error.message}`);
    req.flash('error', 'Error al exportar el historial');
    res.redirect('/auditoria');
  }
}
