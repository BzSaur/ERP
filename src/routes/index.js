import { Router } from 'express';
import authRoutes from './auth.js';
import catalogosRoutes from './catalogos.js';
import empleadosRoutes from './empleados.js';
import usuariosRoutes from './usuarios.js';
import nominaModuleRoutes from './nominaModule.js';
import asistenciaRoutes from './asistencia.js';
import actividadesRoutes from './actividades.js';
import adminRoutes from './admin.js';
import notificacionesRoutes from './notificaciones.js';
import checadorRoutes from './checador.js';
import checadoresAdminRoutes from './checadores-admin.js';
import reportesRoutes from './reportes.js';
import configuracionRoutes from './configuracion.js';
import auditoriaRoutes from './auditoria.js';
import { isAuthenticated } from '../middleware/auth.js';
import prisma from '../config/database.js';
import * as gruposService from '../services/gruposService.js';
import { resolverActividadesPorRango, obtenerAusenciasJustificadas, ausenciaEnFecha } from '../services/asistenciaService.js';

const router = Router();

// Auth
router.use('/auth', authRoutes);

const normalizeRoleHome = (r) => (r || '').toUpperCase().replace(/\s+/g, '_');

// Dashboard
router.get('/', isAuthenticated, async (req, res, next) => {
  try {
    const rol = normalizeRoleHome(req.user?.rol?.Nombre_Rol);
    const esEncargadoPuro = rol === 'ENCARGADO'; // SUPER_ADMIN ve el dashboard general aunque también sea encargado

    if (esEncargadoPuro) {
      const miId = req.user.ID_Empleado;
      if (!miId) {
        return res.render('home-encargado', {
          title: 'Dashboard',
          sinVincular: true,
          grupos: [], equipoSize: 0, porVencer: [],
          equipoHoy: [], resumenHoy: { presentes: 0, enActividad: 0, sinChecada: 0, ausencias: 0, total: 0 },
          proximosDias: [], esDomingoHoy: false
        });
      }

      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const finSemana = new Date(hoy); finSemana.setDate(hoy.getDate() + 6); finSemana.setHours(23, 59, 59, 999);
      const en7Dias = new Date(hoy); en7Dias.setDate(hoy.getDate() + 7);

      const [grupos, equipo] = await Promise.all([
        gruposService.obtenerGruposDeEncargado(miId),
        gruposService.obtenerEquipoVigente(miId, hoy)
      ]);

      const equipoIds = equipo.map(e => e.ID_Empleado);
      const [actividadesMap, porVencer] = await Promise.all([
        equipoIds.length ? resolverActividadesPorRango(equipoIds, hoy, finSemana) : Promise.resolve(new Map()),
        prisma.grupo_Miembros.findMany({
          where: {
            Activo: true,
            Fecha_Fin: { not: null, gte: hoy, lte: en7Dias },
            grupo: { Activo: true, encargado: { ID_Empleado: miId } }
          },
          include: { empleado: { select: { Nombre: true, Apellido_Paterno: true } }, grupo: { select: { Nombre_Grupo: true } } },
          orderBy: { Fecha_Fin: 'asc' }
        })
      ]);

      const NOMBRES_DIA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const empPorId = new Map(equipo.map(e => [e.ID_Empleado, e]));
      const hoyStr = hoy.toISOString().slice(0, 10);

      // --- Situación de HOY: checadas reales + actividad delegada ---
      const [asistenciaHoy, ausenciasHoy] = await Promise.all([
        equipoIds.length
          ? prisma.empleados_Asistencia.findMany({
              where: { ID_Empleado: { in: equipoIds }, Fecha: hoy },
              select: { ID_Empleado: true, Presente: true, Hora_Entrada: true, Hora_Salida: true, Horas_Trabajadas: true, Ubicacion_Entrada: true }
            })
          : Promise.resolve([]),
        equipoIds.length
          ? obtenerAusenciasJustificadas(hoy, hoy)
          : Promise.resolve(new Map())
      ]);
      const asistPorEmp = new Map(asistenciaHoy.map(a => [a.ID_Empleado, a]));

      const fmtHora = (d) => d ? new Date(d).toTimeString().slice(0, 5) : null;
      const esDomingoHoy = hoy.getDay() === 0;

      const equipoHoy = equipo.map(e => {
        const a = asistPorEmp.get(e.ID_Empleado) || null;
        const act = actividadesMap.get(`${e.ID_Empleado}_${hoyStr}`) || null;
        const ausencia = ausenciaEnFecha(ausenciasHoy, e.ID_Empleado, hoy);

        // Estado del día, en orden de precedencia visual.
        let estado;
        if (esDomingoHoy) estado = 'DESCANSO';
        else if (a && a.Hora_Entrada) estado = a.Hora_Salida ? 'COMPLETO' : 'PRESENTE';
        else if (act) estado = 'ACTIVIDAD';
        else if (ausencia) estado = 'AUSENCIA';
        else estado = 'SIN_CHECADA';

        return {
          ID_Empleado: e.ID_Empleado,
          nombre: [e.Nombre, e.Apellido_Paterno].filter(Boolean).join(' '),
          estado,
          entrada: fmtHora(a?.Hora_Entrada),
          salida: fmtHora(a?.Hora_Salida),
          horas: Number(a?.Horas_Trabajadas) || 0,
          planta: a?.Ubicacion_Entrada || null,
          actividad: act,
          ausencia
        };
      });

      // Los que requieren atención primero.
      const ordenEstado = { SIN_CHECADA: 0, ACTIVIDAD: 1, PRESENTE: 2, COMPLETO: 3, AUSENCIA: 4, DESCANSO: 5 };
      equipoHoy.sort((a, b) => ordenEstado[a.estado] - ordenEstado[b.estado] || a.nombre.localeCompare(b.nombre));

      const resumenHoy = {
        presentes: equipoHoy.filter(e => e.estado === 'PRESENTE' || e.estado === 'COMPLETO').length,
        enActividad: equipoHoy.filter(e => e.estado === 'ACTIVIDAD').length,
        sinChecada: equipoHoy.filter(e => e.estado === 'SIN_CHECADA').length,
        ausencias: equipoHoy.filter(e => e.estado === 'AUSENCIA').length,
        total: equipoHoy.length
      };

      // --- Próximos días ya asignados (de mañana en adelante) ---
      const proximos = new Map(); // yyyy-mm-dd -> { fecha, nombreDia, items[] }
      for (const [key, info] of actividadesMap) {
        const [empId, fechaStr] = key.split('_');
        if (fechaStr <= hoyStr) continue; // hoy ya se muestra arriba
        const emp = empPorId.get(parseInt(empId));
        if (!emp) continue;
        if (!proximos.has(fechaStr)) {
          const f = new Date(fechaStr + 'T12:00:00');
          proximos.set(fechaStr, { fecha: fechaStr, nombreDia: NOMBRES_DIA_CORTO[f.getDay()], dia: f.getDate(), items: [] });
        }
        proximos.get(fechaStr).items.push({
          nombreEmpleado: [emp.Nombre, emp.Apellido_Paterno].filter(Boolean).join(' '),
          ...info
        });
      }
      const proximosDias = [...proximos.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
      proximosDias.forEach(d => d.items.sort((a, b) => a.nombreEmpleado.localeCompare(b.nombreEmpleado)));

      return res.render('home-encargado', {
        title: 'Dashboard',
        sinVincular: false,
        grupos,
        equipoSize: equipo.length,
        equipoHoy,
        resumenHoy,
        proximosDias,
        esDomingoHoy,
        porVencer
      });
    }

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
router.use('/encargado', actividadesRoutes);
router.use('/admin', adminRoutes);
router.use('/notificaciones', notificacionesRoutes);
router.use('/checador', checadorRoutes);
router.use('/checadores', checadoresAdminRoutes); // ADMS: CRUD checadores/plantas, push directo
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
