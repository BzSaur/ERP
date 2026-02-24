import { Router } from 'express';
import authRoutes from './auth.js';
import catalogosRoutes from './catalogos.js';
import empleadosRoutes from './empleados.js';
import usuariosRoutes from './usuarios.js';
import nominaModuleRoutes from './nominaModule.js';
import asistenciaRoutes from './asistencia.js';
import checadorRoutes from './checador.js';
import reportesRoutes from './reportes.js';
import configuracionRoutes from './configuracion.js';
import auditoriaRoutes from './auditoria.js';
import { isAuthenticated } from '../middleware/auth.js';
import prisma from '../config/database.js';

const router = Router();

// Auth
router.use('/auth', authRoutes);

// Dashboard
router.get('/', isAuthenticated, async (req, res, next) => {
  try {
    const [
      totalEmpleados,
      empleadosActivos,
      totalAreas,
      totalPuestos,
      ultimosEmpleados
    ] = await Promise.all([
      prisma.empleados.count(),
      prisma.empleados.count({ where: { ID_Estatus: 1 } }),
      prisma.cat_Areas.count(),
      prisma.cat_Puestos.count(),
      prisma.empleados.findMany({
        take: 5,
        orderBy: { CreatedAt: 'desc' },
        include: {
          area: true,
          puesto: true,
          estatus: true
        }
      })
    ]);

    res.render('home', {
      title: 'Dashboard',
      estadisticas: {
        totalEmpleados,
        empleadosActivos,
        empleadosInactivos: totalEmpleados - empleadosActivos,
        totalAreas,
        totalPuestos
      },
      ultimosEmpleados
    });
  } catch (error) {
    next(error);
  }
});

// Perfil
router.get('/perfil', isAuthenticated, (req, res) => {
  res.render('perfil', {
    title: 'Mi Perfil',
    usuario: req.user
  });
});

// Módulos
router.use('/', catalogosRoutes);         // /areas, /puestos, /horarios, /nacionalidades
router.use('/empleados', empleadosRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/', nominaModuleRoutes);       // /nomina, /vacaciones, /aguinaldo, /finiquito, /horas-adicionales
router.use('/asistencia', asistenciaRoutes);
router.use('/checador', checadorRoutes);
router.use('/reportes', reportesRoutes);
router.use('/configuracion', configuracionRoutes);
router.use('/auditoria', auditoriaRoutes);

// Bitácora
router.get('/bitacora', isAuthenticated, async (req, res) => {
  try {
    const { desde, hasta, accion, pagina = 1 } = req.query;
    const porPagina = 50;
    const skip = (Math.max(1, parseInt(pagina) || 1) - 1) * porPagina;

    // Construir filtros dinámicos
    const where = {};
    if (desde) {
      where.FechaHora = { ...(where.FechaHora || {}), gte: new Date(desde + 'T00:00:00') };
    }
    if (hasta) {
      where.FechaHora = { ...(where.FechaHora || {}), lte: new Date(hasta + 'T23:59:59') };
    }
    if (accion && accion !== 'Todos') {
      where.Accion = accion;
    }

    const [registros, total] = await Promise.all([
      prisma.bitacora_Accesos.findMany({
        where,
        include: { usuario: { select: { Nombre_Completo: true, Email_Office365: true } } },
        orderBy: { FechaHora: 'desc' },
        skip,
        take: porPagina
      }),
      prisma.bitacora_Accesos.count({ where })
    ]);

    const totalPaginas = Math.ceil(total / porPagina);

    res.render('bitacora', {
      title: 'Bitácora de Accesos',
      registros,
      filtros: { desde: desde || '', hasta: hasta || '', accion: accion || 'Todos' },
      paginacion: {
        actual: parseInt(pagina) || 1,
        total: totalPaginas,
        totalRegistros: total
      }
    });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al cargar la bitácora');
    res.redirect('/');
  }
});

export default router;
