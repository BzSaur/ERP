import prisma from '../config/database.js';

// ============================================================
// CONTROLADOR DE REPORTES
// ============================================================

// GET /reportes - Dashboard de reportes
export const index = async (req, res, next) => {
  try {
    // Estadísticas generales
    const [
      totalEmpleados,
      empleadosActivos,
      totalAreas,
      totalPuestos
    ] = await Promise.all([
      prisma.empleados.count(),
      prisma.empleados.count({ where: { ID_Estatus: 1 } }),
      prisma.cat_Areas.count(),
      prisma.cat_Puestos.count()
    ]);

    res.render('reportes/index', {
      title: 'Reportes',
      estadisticas: {
        totalEmpleados,
        empleadosActivos,
        empleadosInactivos: totalEmpleados - empleadosActivos,
        totalAreas,
        totalPuestos
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /reportes/por-area - Reporte de empleados por área
export const porArea = async (req, res, next) => {
  try {
    const areas = await prisma.cat_Areas.findMany({
      include: {
        empleados: {
          include: {
            puesto: true,
            estatus: true
          }
        },
        _count: {
          select: { empleados: true }
        }
      },
      orderBy: { Nombre_Area: 'asc' }
    });

    // Calcular totales por área
    const reporteAreas = areas.map(area => ({
      ...area,
      totalEmpleados: area._count.empleados,
      empleadosActivos: area.empleados.filter(e => e.ID_Estatus === 1).length,
      empleadosInactivos: area.empleados.filter(e => e.ID_Estatus !== 1).length
    }));

    res.render('reportes/por-area', {
      title: 'Reporte por Área',
      areas: reporteAreas
    });
  } catch (error) {
    next(error);
  }
};

// GET /reportes/por-horario - Reporte de empleados por tipo de horario
export const porHorario = async (req, res, next) => {
  try {
    const tiposHorario = await prisma.cat_Tipo_Horario.findMany({
      include: {
        empleados: {
          where: { ID_Estatus: 1 },
          include: {
            area: true,
            puesto: true
          }
        },
        _count: {
          select: { empleados: true }
        }
      },
      orderBy: { Nombre_Horario: 'asc' }
    });

    res.render('reportes/por-horario', {
      title: 'Reporte por Tipo de Horario',
      tiposHorario
    });
  } catch (error) {
    next(error);
  }
};

// GET /reportes/por-estatus - Reporte de empleados por estatus
export const porEstatus = async (req, res, next) => {
  try {
    const estatuses = await prisma.cat_Estatus_Empleado.findMany({
      include: {
        empleados: {
          include: {
            area: true,
            puesto: true
          }
        },
        _count: {
          select: { empleados: true }
        }
      },
      orderBy: { Nombre_Estatus: 'asc' }
    });

    res.render('reportes/por-estatus', {
      title: 'Reporte por Estatus',
      estatuses
    });
  } catch (error) {
    next(error);
  }
};

// GET /reportes/altas-bajas - Reporte de altas y bajas
export const altasBajas = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const yearInt = parseInt(year);

    // Empleados que ingresaron este año
    const altas = await prisma.empleados.findMany({
      where: {
        Fecha_Ingreso: {
          gte: new Date(`${yearInt}-01-01`),
          lte: new Date(`${yearInt}-12-31`)
        }
      },
      include: {
        area: true,
        puesto: true
      },
      orderBy: { Fecha_Ingreso: 'desc' }
    });

    // Empleados que fueron dados de baja este año
    const bajas = await prisma.empleados.findMany({
      where: {
        Fecha_Baja: {
          gte: new Date(`${yearInt}-01-01`),
          lte: new Date(`${yearInt}-12-31`)
        }
      },
      include: {
        area: true,
        puesto: true
      },
      orderBy: { Fecha_Baja: 'desc' }
    });

    res.render('reportes/altas-bajas', {
      title: 'Reporte de Altas y Bajas',
      year: yearInt,
      altas,
      bajas
    });
  } catch (error) {
    next(error);
  }
};

export default {
  index,
  porArea,
  porHorario,
  porEstatus,
  altasBajas
};
