import prisma from '../config/database.js';
import { registrarCambio, obtenerIP } from '../middleware/audit.js';

// ============================================================
// CONTROLADOR DE ENCARGADOS / ACTIVIDADES DE CAMPO
// Delegación de asistencia por día para trabajo de campo donde el
// personal no puede sellar (obra/cliente externo).
// ============================================================

const normalizeRole = (roleName) => (roleName || '').toUpperCase().replace(/\s+/g, '_');

// ¿El usuario tiene visión de supervisión (ve/gestiona todas las actividades,
// no solo las propias)? ADMIN, RH, SUPER_ADMIN.
function esSupervisor(user) {
  const rol = normalizeRole(user?.rol?.Nombre_Rol);
  return ['ADMIN', 'ADMINISTRADOR', 'RH', 'RECURSOS_HUMANOS', 'SUPER_ADMIN', 'SUPERADMINISTRADOR'].includes(rol);
}

const fmtFecha = (d) => new Date(d).toISOString().slice(0, 10);

// ============================================================
// EQUIPO (subordinados del encargado)
// ============================================================

// GET /encargado/equipo - Mi equipo (autoservicio del encargado)
export const equipo = async (req, res, next) => {
  try {
    const miId = req.user.ID_Empleado;
    if (!miId) {
      req.flash('error', 'Tu usuario no está vinculado a un empleado. Contacta a un administrador.');
      return res.redirect('/');
    }

    const [equipoActual, empleadosActivos] = await Promise.all([
      prisma.encargado_Subordinados.findMany({
        where: { ID_Encargado: miId },
        include: {
          subordinado: {
            select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true, area: { select: { Nombre_Area: true } }, puesto: { select: { Nombre_Puesto: true } } }
          }
        },
        orderBy: { subordinado: { Nombre: 'asc' } }
      }),
      prisma.empleados.findMany({
        where: { ID_Estatus: 1, ID_Empleado: { not: miId } },
        orderBy: { Nombre: 'asc' },
        select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true }
      })
    ]);

    const yaEnEquipo = new Set(equipoActual.map(e => e.ID_Subordinado));
    const disponibles = empleadosActivos.filter(e => !yaEnEquipo.has(e.ID_Empleado));

    res.render('encargado/equipo', {
      title: 'Mi Equipo',
      equipoActual,
      disponibles
    });
  } catch (error) {
    next(error);
  }
};

// POST /encargado/equipo - Agregar empleado al equipo
export const agregarSubordinado = async (req, res, next) => {
  try {
    const miId = req.user.ID_Empleado;
    const idSubordinado = parseInt(req.body.ID_Subordinado);

    if (!miId) {
      req.flash('error', 'Tu usuario no está vinculado a un empleado.');
      return res.redirect('/');
    }
    if (!Number.isInteger(idSubordinado) || idSubordinado === miId) {
      req.flash('error', 'Selecciona un empleado válido');
      return res.redirect('/encargado/equipo');
    }

    await prisma.encargado_Subordinados.upsert({
      where: { ID_Encargado_ID_Subordinado: { ID_Encargado: miId, ID_Subordinado: idSubordinado } },
      update: {},
      create: { ID_Encargado: miId, ID_Subordinado: idSubordinado, CreatedBy: req.user.Email_Office365 }
    });

    req.flash('success', 'Empleado agregado a tu equipo');
    res.redirect('/encargado/equipo');
  } catch (error) {
    next(error);
  }
};

// POST /encargado/equipo/:idSubordinado/eliminar - Quitar empleado del equipo
export const quitarSubordinado = async (req, res, next) => {
  try {
    const miId = req.user.ID_Empleado;
    const idSubordinado = parseInt(req.params.idSubordinado);

    await prisma.encargado_Subordinados.deleteMany({
      where: { ID_Encargado: miId, ID_Subordinado: idSubordinado }
    });

    req.flash('success', 'Empleado eliminado de tu equipo');
    res.redirect('/encargado/equipo');
  } catch (error) {
    next(error);
  }
};

// ============================================================
// ACTIVIDADES
// ============================================================

// GET /encargado - Mis actividades (o todas, si RH/Admin/SuperAdmin)
export const index = async (req, res, next) => {
  try {
    const supervisor = esSupervisor(req.user);
    const miId = req.user.ID_Empleado;

    const where = supervisor ? {} : { ID_Responsable: miId };
    if (!supervisor && !miId) {
      req.flash('error', 'Tu usuario no está vinculado a un empleado.');
      return res.redirect('/');
    }

    const actividades = await prisma.actividades_Campo.findMany({
      where,
      include: {
        empresa: true,
        responsable: { select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true } },
        _count: { select: { asignaciones: true } },
        asignaciones: { select: { ID_Empleado: true, Fecha: true }, orderBy: { Fecha: 'asc' } }
      },
      orderBy: { CreatedAt: 'desc' }
    });

    const resumen = actividades.map(a => {
      const empleadosUnicos = new Set(a.asignaciones.map(x => x.ID_Empleado));
      const fechas = a.asignaciones.map(x => x.Fecha);
      return {
        ...a,
        totalEmpleados: empleadosUnicos.size,
        totalDias: a._count.asignaciones,
        fechaMin: fechas.length ? fmtFecha(fechas[0]) : null,
        fechaMax: fechas.length ? fmtFecha(fechas[fechas.length - 1]) : null
      };
    });

    res.render('encargado/index', {
      title: 'Actividades de Campo',
      actividades: resumen,
      esSupervisor: supervisor
    });
  } catch (error) {
    next(error);
  }
};

// GET /encargado/actividades/crear - Formulario de nueva actividad
export const crear = async (req, res, next) => {
  try {
    const miId = req.user.ID_Empleado;
    if (!miId) {
      req.flash('error', 'Tu usuario no está vinculado a un empleado. Contacta a un administrador.');
      return res.redirect('/');
    }

    const [equipoActual, empresas] = await Promise.all([
      prisma.encargado_Subordinados.findMany({
        where: { ID_Encargado: miId },
        include: { subordinado: { select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true } } },
        orderBy: { subordinado: { Nombre: 'asc' } }
      }),
      prisma.cat_Empresas.findMany({ where: { Activo: true }, orderBy: { Nombre_Empresa: 'asc' } })
    ]);

    if (equipoActual.length === 0) {
      req.flash('info', 'Aún no tienes empleados en tu equipo. Agrégalos primero en "Mi Equipo".');
    }

    res.render('encargado/crear', {
      title: 'Nueva Actividad de Campo',
      equipoActual,
      empresas
    });
  } catch (error) {
    next(error);
  }
};

// POST /encargado/actividades - Guardar nueva actividad + asignaciones
export const store = async (req, res, next) => {
  try {
    const miId = req.user.ID_Empleado;
    if (!miId) {
      req.flash('error', 'Tu usuario no está vinculado a un empleado.');
      return res.redirect('/');
    }

    const { Nombre_Actividad, ID_Empresa, Nueva_Empresa, Descripcion, dias } = req.body;
    const subordinados = (req.body.subordinados == null ? [] : Array.isArray(req.body.subordinados) ? req.body.subordinados : [req.body.subordinados])
      .map(Number).filter(Number.isInteger);
    const fechas = (dias || '').split(',').map(s => s.trim()).filter(Boolean);

    if (!Nombre_Actividad || !Nombre_Actividad.trim()) {
      req.flash('error', 'El nombre de la actividad es obligatorio');
      return res.redirect('/encargado/actividades/crear');
    }
    if (subordinados.length === 0) {
      req.flash('error', 'Selecciona al menos un empleado de tu equipo');
      return res.redirect('/encargado/actividades/crear');
    }
    if (fechas.length === 0) {
      req.flash('error', 'Selecciona al menos un día para la actividad');
      return res.redirect('/encargado/actividades/crear');
    }

    // Los subordinados deben pertenecer a mi equipo
    const equipo = await prisma.encargado_Subordinados.findMany({
      where: { ID_Encargado: miId },
      select: { ID_Subordinado: true }
    });
    const equipoIds = new Set(equipo.map(e => e.ID_Subordinado));
    const invalidos = subordinados.filter(id => !equipoIds.has(id));
    if (invalidos.length > 0) {
      req.flash('error', 'Solo puedes asignar días a empleados de tu equipo');
      return res.redirect('/encargado/actividades/crear');
    }

    // Resolver empresa: existente o find-or-create por nombre
    let idEmpresa = ID_Empresa ? parseInt(ID_Empresa) : null;
    if (!idEmpresa && Nueva_Empresa && Nueva_Empresa.trim()) {
      const nombre = Nueva_Empresa.trim();
      const existente = await prisma.cat_Empresas.findFirst({
        where: { Nombre_Empresa: { equals: nombre, mode: 'insensitive' } }
      });
      idEmpresa = existente
        ? existente.ID_Empresa
        : (await prisma.cat_Empresas.create({ data: { Nombre_Empresa: nombre, CreatedAt: new Date() } })).ID_Empresa;
    }
    if (!idEmpresa) {
      req.flash('error', 'Selecciona una empresa existente o captura el nombre de una nueva');
      return res.redirect('/encargado/actividades/crear');
    }

    // Validar que ningún empleado ya tenga actividad de campo ese día
    // (@@unique([ID_Empleado, Fecha]) lo impediría de todas formas; validamos antes
    // para dar un mensaje claro en vez de un error genérico de BD)
    const fechasDate = fechas.map(f => new Date(f));
    const choques = await prisma.actividad_Asignaciones.findMany({
      where: { ID_Empleado: { in: subordinados }, Fecha: { in: fechasDate } },
      include: { empleado: { select: { Nombre: true, Apellido_Paterno: true } } }
    });
    if (choques.length > 0) {
      const detalle = choques.slice(0, 5)
        .map(c => `${c.empleado.Nombre} ${c.empleado.Apellido_Paterno} (${fmtFecha(c.Fecha)})`)
        .join(', ');
      req.flash('error', `Ya existe una actividad asignada ese día para: ${detalle}${choques.length > 5 ? '…' : ''}`);
      return res.redirect('/encargado/actividades/crear');
    }

    const actividad = await prisma.actividades_Campo.create({
      data: {
        Nombre_Actividad: Nombre_Actividad.trim(),
        ID_Empresa: idEmpresa,
        ID_Responsable: miId,
        Descripcion: Descripcion || null,
        CreatedBy: req.user.Email_Office365
      }
    });

    const combinaciones = [];
    for (const empId of subordinados) {
      for (const f of fechasDate) {
        combinaciones.push({ ID_Actividad: actividad.ID_Actividad, ID_Empleado: empId, Fecha: f, CreatedBy: req.user.Email_Office365 });
      }
    }
    await prisma.actividad_Asignaciones.createMany({ data: combinaciones });

    await registrarCambio({
      usuario: req.user,
      accion: 'CREATE',
      tabla: 'Actividades_Campo',
      idRegistro: actividad.ID_Actividad.toString(),
      descripcion: `Actividad de campo creada: ${actividad.Nombre_Actividad} (${subordinados.length} empleado(s), ${fechas.length} día(s))`,
      datosNuevos: { ID_Actividad: actividad.ID_Actividad, Nombre_Actividad: actividad.Nombre_Actividad, ID_Empresa: idEmpresa, subordinados, fechas },
      ip: obtenerIP(req)
    });

    req.flash('success', 'Actividad creada exitosamente');
    res.redirect(`/encargado/actividades/${actividad.ID_Actividad}`);
  } catch (error) {
    next(error);
  }
};

// GET /encargado/actividades/:id - Detalle: tabla de empleados + desglose de días
export const ver = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const actividad = await prisma.actividades_Campo.findUnique({
      where: { ID_Actividad: id },
      include: {
        empresa: true,
        responsable: { select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true } },
        asignaciones: {
          include: { empleado: { select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true, area: { select: { Nombre_Area: true } } } } },
          orderBy: [{ ID_Empleado: 'asc' }, { Fecha: 'asc' }]
        }
      }
    });

    if (!actividad) {
      req.flash('error', 'Actividad no encontrada');
      return res.redirect('/encargado');
    }

    const supervisor = esSupervisor(req.user);
    if (!supervisor && actividad.ID_Responsable !== req.user.ID_Empleado) {
      return res.status(403).render('errors/403', { title: 'Acceso Denegado', message: 'Esta actividad no te pertenece' });
    }

    // Cruzar con asistencia real: ¿selló ese empleado ese día?
    const empIds = [...new Set(actividad.asignaciones.map(a => a.ID_Empleado))];
    const fechas = [...new Set(actividad.asignaciones.map(a => fmtFecha(a.Fecha)))];
    const asistencias = empIds.length
      ? await prisma.empleados_Asistencia.findMany({
          where: { ID_Empleado: { in: empIds }, Fecha: { in: fechas.map(f => new Date(f)) } },
          select: { ID_Empleado: true, Fecha: true, Hora_Entrada: true, Hora_Salida: true }
        })
      : [];
    const selloMap = new Map(asistencias.map(a => [`${a.ID_Empleado}_${fmtFecha(a.Fecha)}`, a]));

    // Agrupar asignaciones por empleado para la tabla
    const porEmpleado = new Map();
    for (const asig of actividad.asignaciones) {
      const key = asig.ID_Empleado;
      if (!porEmpleado.has(key)) {
        porEmpleado.set(key, { empleado: asig.empleado, dias: [] });
      }
      const fechaStr = fmtFecha(asig.Fecha);
      const sello = selloMap.get(`${asig.ID_Empleado}_${fechaStr}`) || null;
      porEmpleado.get(key).dias.push({
        ID_Asignacion: asig.ID_Asignacion,
        fecha: fechaStr,
        sello: !!(sello && sello.Hora_Entrada)
      });
    }

    res.render('encargado/detalle', {
      title: actividad.Nombre_Actividad,
      actividad,
      filas: [...porEmpleado.values()],
      esSupervisor: supervisor
    });
  } catch (error) {
    next(error);
  }
};

// POST /encargado/actividades/:id/asignaciones - Agregar más días/empleados
export const agregarAsignacion = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const actividad = await prisma.actividades_Campo.findUnique({ where: { ID_Actividad: id } });
    if (!actividad) {
      req.flash('error', 'Actividad no encontrada');
      return res.redirect('/encargado');
    }
    if (actividad.ID_Responsable !== req.user.ID_Empleado && !esSupervisor(req.user)) {
      return res.status(403).render('errors/403', { title: 'Acceso Denegado', message: 'Esta actividad no te pertenece' });
    }

    const subordinados = (req.body.subordinados == null ? [] : Array.isArray(req.body.subordinados) ? req.body.subordinados : [req.body.subordinados])
      .map(Number).filter(Number.isInteger);
    const fechas = (req.body.dias || '').split(',').map(s => s.trim()).filter(Boolean);

    if (subordinados.length === 0 || fechas.length === 0) {
      req.flash('error', 'Selecciona empleados y días');
      return res.redirect(`/encargado/actividades/${id}`);
    }

    const equipo = await prisma.encargado_Subordinados.findMany({ where: { ID_Encargado: actividad.ID_Responsable }, select: { ID_Subordinado: true } });
    const equipoIds = new Set(equipo.map(e => e.ID_Subordinado));
    const invalidos = subordinados.filter(eid => !equipoIds.has(eid));
    if (invalidos.length > 0) {
      req.flash('error', 'Solo se pueden asignar empleados del equipo del responsable');
      return res.redirect(`/encargado/actividades/${id}`);
    }

    const fechasDate = fechas.map(f => new Date(f));
    const choques = await prisma.actividad_Asignaciones.findMany({
      where: { ID_Empleado: { in: subordinados }, Fecha: { in: fechasDate } },
      include: { empleado: { select: { Nombre: true, Apellido_Paterno: true } } }
    });
    if (choques.length > 0) {
      const detalle = choques.slice(0, 5).map(c => `${c.empleado.Nombre} ${c.empleado.Apellido_Paterno} (${fmtFecha(c.Fecha)})`).join(', ');
      req.flash('error', `Ya existe una actividad asignada ese día para: ${detalle}`);
      return res.redirect(`/encargado/actividades/${id}`);
    }

    const combinaciones = [];
    for (const empId of subordinados) {
      for (const f of fechasDate) {
        combinaciones.push({ ID_Actividad: id, ID_Empleado: empId, Fecha: f, CreatedBy: req.user.Email_Office365 });
      }
    }
    await prisma.actividad_Asignaciones.createMany({ data: combinaciones });

    req.flash('success', 'Días agregados');
    res.redirect(`/encargado/actividades/${id}`);
  } catch (error) {
    next(error);
  }
};

// POST /encargado/actividades/:id/asignaciones/:idAsignacion/eliminar - Quitar un día
export const quitarAsignacion = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const idAsignacion = parseInt(req.params.idAsignacion);

    const actividad = await prisma.actividades_Campo.findUnique({ where: { ID_Actividad: id } });
    if (!actividad) {
      req.flash('error', 'Actividad no encontrada');
      return res.redirect('/encargado');
    }
    if (actividad.ID_Responsable !== req.user.ID_Empleado && !esSupervisor(req.user)) {
      return res.status(403).render('errors/403', { title: 'Acceso Denegado', message: 'Esta actividad no te pertenece' });
    }

    await prisma.actividad_Asignaciones.deleteMany({ where: { ID_Asignacion: idAsignacion, ID_Actividad: id } });

    req.flash('success', 'Día eliminado de la actividad');
    res.redirect(`/encargado/actividades/${id}`);
  } catch (error) {
    next(error);
  }
};

export default {
  equipo,
  agregarSubordinado,
  quitarSubordinado,
  index,
  crear,
  store,
  ver,
  agregarAsignacion,
  quitarAsignacion
};
