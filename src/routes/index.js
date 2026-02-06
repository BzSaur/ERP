import { Router } from 'express';
import authRoutes from './auth.js';
import empleadosRoutes from './empleados.js';
import areasRoutes from './areas.js';
import puestosRoutes from './puestos.js';
import reportesRoutes from './reportes.js';
import usuariosRoutes from './usuarios.js';
import nacionalidadesRoutes from './nacionalidades.js';
import horariosRoutes from './horarios.js';
import horasAdicionalesRoutes from './horasAdicionales.js';
import configuracionRoutes from './configuracion.js';
import nominaRoutes from './nomina.js';
import vacacionesRoutes from './vacaciones.js';
import aguinaldoRoutes from './aguinaldo.js';
import finiquitoRoutes from './finiquito.js';
import asistenciaRoutes from './asistencia.js';
import checadorRoutes from './checador.js';
import { isAuthenticated } from '../middleware/auth.js';
import prisma from '../config/database.js';

const router = Router();

// ============================================================
// RUTAS PRINCIPALES
// ============================================================

// Rutas de autenticación
router.use('/auth', authRoutes);

// Home - Dashboard principal
router.get('/', isAuthenticated, async (req, res, next) => {
  try {
    // Estadísticas para el dashboard
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

// Perfil del usuario
router.get('/perfil', isAuthenticated, (req, res) => {
  res.render('perfil', {
    title: 'Mi Perfil',
    usuario: req.user
  });
});

// Rutas de módulos
router.use('/empleados', empleadosRoutes);
router.use('/areas', areasRoutes);
router.use('/puestos', puestosRoutes);
router.use('/reportes', reportesRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/nacionalidades', nacionalidadesRoutes);
router.use('/horarios', horariosRoutes);
router.use('/horas-adicionales', horasAdicionalesRoutes);
router.use('/configuracion', configuracionRoutes);
router.use('/nomina', nominaRoutes);
router.use('/vacaciones', vacacionesRoutes);
router.use('/aguinaldo', aguinaldoRoutes);
router.use('/finiquito', finiquitoRoutes);
router.use('/asistencia', asistenciaRoutes);
router.use('/checador', checadorRoutes);

// Bitácora (para SuperAdmin)
router.get('/bitacora', isAuthenticated, async (req, res) => {
  try {
    const registros = await prisma.bitacora_Accesos.findMany({
      include: { usuario: { select: { Nombre_Completo: true, Email_Office365: true } } },
      orderBy: { Fecha_Hora: 'desc' },
      take: 100
    });
    res.render('bitacora', { title: 'Bitácora de Accesos', registros });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al cargar la bitácora');
    res.redirect('/');
  }
});

export default router;
