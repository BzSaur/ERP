import prisma from '../config/database.js';
import { registrarCambio, obtenerIP } from '../middleware/audit.js';
import { crearNotificacionParaEmpleado } from '../services/notificacionesService.js';
import { obtenerEquipoVigente, empleadoEnEquipoDeEncargado } from '../services/gruposService.js';
import { resolverActividadesPorRango } from '../services/asistenciaService.js';
import { getSemanaActual } from '../services/nominaService.js';

// ============================================================
// CONTROLADOR DE ENCARGADOS / ACTIVIDADES DE CAMPO Y HOME OFFICE
// Delegación de asistencia por día para trabajo de campo (obra/cliente
// externo) o home office donde el personal no sella normalmente.
// El equipo de cada encargado es la unión vigente de miembros de sus Grupos
// (ver gruposService.js) — no un equipo fijo único.
// ============================================================

const normalizeRole = (roleName) => (roleName || '').toUpperCase().replace(/\s+/g, '_');

// ¿El usuario tiene visión de supervisión (ve/gestiona todas las actividades,
// no solo las propias)? ADMIN, RH, SUPER_ADMIN.
function esSupervisor(user) {
  const rol = normalizeRole(user?.rol?.Nombre_Rol);
  return ['ADMIN', 'ADMINISTRADOR', 'RH', 'RECURSOS_HUMANOS', 'SUPER_ADMIN', 'SUPERADMINISTRADOR'].includes(rol);
}

// SuperAdmin puro (no ADMIN/RH): puede delegar una actividad a CUALQUIER
// encargado, eligiendo a nombre de quién la crea.
function esSuperAdminDelegante(user) {
  const rol = normalizeRole(user?.rol?.Nombre_Rol);
  return ['SUPER_ADMIN', 'SUPERADMINISTRADOR'].includes(rol);
}

// Resuelve el ID_Empleado del encargado "dueño" efectivo de la operación: el
// propio usuario si es ENCARGADO, o el elegido en el <select> si es SuperAdmin.
function resolverEncargadoEfectivo(req) {
  if (esSuperAdminDelegante(req.user)) {
    const submitted = parseInt(req.body?.ID_Encargado_Empleado ?? req.query?.ID_Encargado_Empleado ?? req.query?.encargado);
    return Number.isInteger(submitted) ? submitted : null;
  }
  return req.user.ID_Empleado ?? null;
}

const fmtFecha = (d) => new Date(d).toISOString().slice(0, 10);

// ============================================================
// ACTIVIDADES
// ============================================================

// GET /encargado - Calendario editable de actividades del equipo.
// Filas = empleados del equipo vigente; columnas = días reales del rango
// (por defecto la semana actual). Cada celda muestra/alterna la actividad de
// ese empleado ese día: puntual (Actividad_Asignaciones) o recurrente
// (Actividad_Recurrencias resuelta) — la puntual siempre gana sobre la regla.
export const index = async (req, res, next) => {
  try {
    const esDelegante = esSuperAdminDelegante(req.user);
    const miIdResuelto = resolverEncargadoEfectivo(req);

    // SuperAdmin sin encargado elegido: mostrar solo el selector.
    let miId = miIdResuelto;
    if (!miId) {
      if (esDelegante) {
        const encargadosDisponibles = await prisma.cat_Encargados.findMany({
          where: { Activo: true },
          include: { empleado: { select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true } } },
          orderBy: { empleado: { Nombre: 'asc' } }
        });
        // Con un solo encargado no tiene sentido pedir que elija: se asume.
        if (encargadosDisponibles.length === 1) {
          miId = encargadosDisponibles[0].empleado.ID_Empleado;
        } else {
          return res.render('encargado/index', {
            title: 'Actividades de Campo',
            equipo: [], fechas: [], celdas: new Map(),
            empresas: [], tiposActividad: [],
            fechaInicio: '', fechaFin: '',
            esSupervisorParaDelegar: true,
            encargadosDisponibles,
            idEncargadoPreseleccionado: null
          });
        }
      } else {
        req.flash('error', 'Tu usuario no está vinculado a un empleado.');
        return res.redirect('/');
      }
    }

    // Rango: por defecto la semana actual (lunes a sábado).
    const semana = getSemanaActual();
    const inicio = req.query.fechaInicio ? new Date(`${req.query.fechaInicio}T00:00:00`) : semana.lunes;
    const fin = req.query.fechaFin ? new Date(`${req.query.fechaFin}T00:00:00`) : semana.sabado;
    inicio.setHours(0, 0, 0, 0);
    fin.setHours(23, 59, 59, 999);

    const [equipo, empresas, tiposActividad, encargadosDisponibles] = await Promise.all([
      obtenerEquipoVigente(miId),
      prisma.cat_Empresas.findMany({ where: { Activo: true }, orderBy: { Nombre_Empresa: 'asc' } }),
      prisma.cat_Tipo_Actividad.findMany({ where: { Activo: true }, orderBy: { Nombre: 'asc' } }),
      esDelegante
        ? prisma.cat_Encargados.findMany({
            where: { Activo: true },
            include: { empleado: { select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true } } },
            orderBy: { empleado: { Nombre: 'asc' } }
          })
        : Promise.resolve([])
    ]);

    // Mapa `${ID_Empleado}_${yyyy-mm-dd}` -> actividad resuelta (puntual gana).
    const celdas = equipo.length
      ? await resolverActividadesPorRango(equipo.map(e => e.ID_Empleado), inicio, fin)
      : new Map();

    // Días del rango (se omiten domingos: no laborables).
    const fechas = [];
    for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0) continue;
      const f = new Date(d); f.setHours(0, 0, 0, 0);
      fechas.push(f);
    }

    // Última empresa usada, para preseleccionarla en los valores por defecto.
    const ultima = await prisma.actividades_Campo.findFirst({
      where: { ID_Responsable: miId },
      orderBy: { CreatedAt: 'desc' },
      select: { ID_Empresa: true, ID_Tipo_Actividad: true }
    });

    res.render('encargado/index', {
      title: 'Actividades de Campo',
      equipo, fechas, celdas,
      empresas, tiposActividad,
      ultimaEmpresaId: ultima?.ID_Empresa || null,
      ultimoTipoId: ultima?.ID_Tipo_Actividad || null,
      fechaInicio: inicio.toISOString().slice(0, 10),
      fechaFin: new Date(fin).toISOString().slice(0, 10),
      esSupervisorParaDelegar: esDelegante,
      encargadosDisponibles,
      idEncargadoPreseleccionado: miId
    });
  } catch (error) {
    next(error);
  }
};

// GET /encargado/actividades/crear - Formulario de nueva actividad
export const crear = async (req, res, next) => {
  try {
    const esDelegante = esSuperAdminDelegante(req.user);
    let miId = resolverEncargadoEfectivo(req);

    if (!miId) {
      if (esDelegante) {
        // SuperAdmin aún no elige a nombre de quién crea — muestra el
        // selector de encargado, sin equipo cargado todavía.
        const encargadosDisponibles = await prisma.cat_Encargados.findMany({
          where: { Activo: true },
          include: { empleado: { select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true } } },
          orderBy: { empleado: { Nombre: 'asc' } }
        });
        // Con un solo encargado no tiene sentido pedir que elija: se asume.
        if (encargadosDisponibles.length === 1) {
          miId = encargadosDisponibles[0].empleado.ID_Empleado;
        } else {
          return res.render('encargado/crear', {
            title: 'Nueva Actividad',
            equipoActual: [],
            empresas: [],
            tiposActividad: [],
            duplicarDe: null,
            ultimaEmpresaId: null,
            esSupervisorParaDelegar: true,
            encargadosDisponibles,
            idEncargadoPreseleccionado: null
          });
        }
      } else {
        req.flash('error', 'Tu usuario no está vinculado a un empleado. Contacta a un administrador.');
        return res.redirect('/');
      }
    }

    const [equipoVigente, empresas, tiposActividad, encargadosDisponibles] = await Promise.all([
      obtenerEquipoVigente(miId),
      prisma.cat_Empresas.findMany({ where: { Activo: true }, orderBy: { Nombre_Empresa: 'asc' } }),
      prisma.cat_Tipo_Actividad.findMany({ where: { Activo: true }, orderBy: { Nombre: 'asc' } }),
      esDelegante
        ? prisma.cat_Encargados.findMany({
            where: { Activo: true },
            include: { empleado: { select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true } } },
            orderBy: { empleado: { Nombre: 'asc' } }
          })
        : Promise.resolve([])
    ]);

    if (equipoVigente.length === 0) {
      req.flash('info', 'Aún no tienes empleados vigentes en tu equipo. Un SuperAdmin debe agregarte miembros en Grupos.');
    }

    // Duplicar (?duplicar=ID): precargar tipo/nombre/empresa/empleados de una
    // actividad propia existente, dejando solo los días por elegir de nuevo.
    let duplicarDe = null;
    const idDuplicar = parseInt(req.query.duplicar);
    if (Number.isInteger(idDuplicar)) {
      const origen = await prisma.actividades_Campo.findUnique({
        where: { ID_Actividad: idDuplicar },
        include: { asignaciones: { select: { ID_Empleado: true }, distinct: ['ID_Empleado'] } }
      });
      if (origen && origen.ID_Responsable === miId) {
        duplicarDe = {
          ID_Tipo_Actividad: origen.ID_Tipo_Actividad,
          Nombre_Actividad: origen.Nombre_Actividad,
          ID_Empresa: origen.ID_Empresa,
          Descripcion: origen.Descripcion,
          empleadosIds: origen.asignaciones.map(a => a.ID_Empleado)
        };
      }
    }

    res.render('encargado/crear', {
      title: duplicarDe ? 'Duplicar Actividad' : 'Nueva Actividad',
      equipoActual: equipoVigente,
      empresas,
      tiposActividad,
      duplicarDe,
      // Última empresa usada por este encargado, para preseleccionarla en
      // creaciones seguidas del mismo cliente/proyecto (si no se está duplicando).
      ultimaEmpresaId: duplicarDe ? null : (await prisma.actividades_Campo.findFirst({
        where: { ID_Responsable: miId },
        orderBy: { CreatedAt: 'desc' },
        select: { ID_Empresa: true }
      }))?.ID_Empresa || null,
      esSupervisorParaDelegar: esDelegante,
      encargadosDisponibles,
      idEncargadoPreseleccionado: miId
    });
  } catch (error) {
    next(error);
  }
};

// POST /encargado/actividades - Guardar nueva actividad + asignaciones
export const store = async (req, res, next) => {
  try {
    const esDelegante = esSuperAdminDelegante(req.user);
    const miId = resolverEncargadoEfectivo(req);
    // Al re-renderizar el form tras un error, preservar la selección de
    // encargado del SuperAdmin (si aplica) vía querystring.
    const redirectCrear = esDelegante && miId
      ? `/encargado/actividades/crear?encargado=${miId}`
      : '/encargado/actividades/crear';

    if (!miId) {
      req.flash('error', esDelegante ? 'Selecciona un encargado responsable.' : 'Tu usuario no está vinculado a un empleado.');
      return res.redirect(esDelegante ? '/encargado/actividades/crear' : '/');
    }

    const modo = req.body.Modo === 'RECURRENTE' ? 'RECURRENTE' : 'PUNTUAL';
    if (modo === 'RECURRENTE') {
      return storeRecurrente(req, res, next, miId, esDelegante);
    }

    const { Nombre_Actividad, ID_Empresa, Nueva_Empresa, Descripcion, dias } = req.body;
    const idTipoActividad = parseInt(req.body.ID_Tipo_Actividad);
    const subordinados = (req.body.subordinados == null ? [] : Array.isArray(req.body.subordinados) ? req.body.subordinados : [req.body.subordinados])
      .map(Number).filter(Number.isInteger);
    const fechas = (dias || '').split(',').map(s => s.trim()).filter(Boolean);

    if (!Nombre_Actividad || !Nombre_Actividad.trim()) {
      req.flash('error', 'El nombre de la actividad es obligatorio');
      return res.redirect(redirectCrear);
    }
    if (!Number.isInteger(idTipoActividad)) {
      req.flash('error', 'Selecciona un tipo de actividad');
      return res.redirect(redirectCrear);
    }
    const tipoValido = await prisma.cat_Tipo_Actividad.findUnique({ where: { ID_Tipo_Actividad: idTipoActividad } });
    if (!tipoValido || !tipoValido.Activo) {
      req.flash('error', 'El tipo de actividad seleccionado ya no está disponible');
      return res.redirect(redirectCrear);
    }
    if (subordinados.length === 0) {
      req.flash('error', 'Selecciona al menos un empleado de tu equipo');
      return res.redirect(redirectCrear);
    }
    if (fechas.length === 0) {
      req.flash('error', 'Selecciona al menos un día para la actividad');
      return res.redirect(redirectCrear);
    }

    // Cada empleado debe pertenecer a mi equipo vigente EN CADA fecha elegida
    // (una membresía puede no cubrir todo el rango seleccionado).
    for (const f of fechas) {
      const fechaDate = new Date(f);
      for (const empId of subordinados) {
        if (!(await empleadoEnEquipoDeEncargado(empId, miId, fechaDate))) {
          req.flash('error', `Un empleado seleccionado no pertenece a tu equipo vigente el ${f}`);
          return res.redirect(redirectCrear);
        }
      }
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
      return res.redirect(redirectCrear);
    }

    // Validar que ningún empleado ya tenga actividad ese día (puntual o de
    // recurrencia — la recurrencia no bloquea aquí porque se resuelve en
    // consulta, no en BD; una puntual nueva simplemente la desplaza ese día).
    // @@unique([ID_Empleado, Fecha]) lo impediría de todas formas contra otra
    // puntual; validamos antes para dar un mensaje claro en vez de un error
    // genérico de BD.
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
      return res.redirect(redirectCrear);
    }

    const actividad = await prisma.actividades_Campo.create({
      data: {
        Nombre_Actividad: Nombre_Actividad.trim(),
        ID_Tipo_Actividad: idTipoActividad,
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
      descripcion: `Actividad creada: ${actividad.Nombre_Actividad} [${tipoValido.Nombre}] (${subordinados.length} empleado(s), ${fechas.length} día(s))`,
      datosNuevos: { ID_Actividad: actividad.ID_Actividad, Nombre_Actividad: actividad.Nombre_Actividad, ID_Tipo_Actividad: idTipoActividad, ID_Empresa: idEmpresa, subordinados, fechas },
      ip: obtenerIP(req)
    });

    for (const empId of subordinados) {
      try {
        await crearNotificacionParaEmpleado({
          idEmpleado: empId,
          tipo: 'ACTIVIDAD_ASIGNADA',
          titulo: 'Actividad asignada',
          mensaje: `"${actividad.Nombre_Actividad}" — ${fechas.length} día(s), a partir del ${fechas[0]}.`,
          url: `/encargado/actividades/${actividad.ID_Actividad}`
        });
      } catch (err) {
        // best-effort
      }
    }

    req.flash('success', 'Actividad creada exitosamente');
    res.redirect(`/encargado/actividades/${actividad.ID_Actividad}`);
  } catch (error) {
    next(error);
  }
};

const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Valida que no exista otra regla activa del mismo empleado+día de semana
// cuya vigencia se traslape con [Fecha_Inicio, Fecha_Fin]. Mismo criterio
// que gruposController.
async function hayTraslapeRecurrencia(idEmpleado, diaSemana, fechaInicio, fechaFin) {
  const existente = await prisma.actividad_Recurrencias.findFirst({
    where: {
      ID_Empleado: idEmpleado,
      Dia_Semana: diaSemana,
      Activo: true,
      Fecha_Inicio: { lte: fechaFin ?? new Date('9999-12-31') },
      OR: [{ Fecha_Fin: null }, { Fecha_Fin: { gte: fechaInicio } }]
    }
  });
  return !!existente;
}

// POST /encargado/actividades (Modo=RECURRENTE) - Una regla de recurrencia
// por cada (empleado × día de semana marcado en su fila de la tabla).
// Empieza automáticamente al día siguiente, sin fecha de fin.
async function storeRecurrente(req, res, next, miId, esDelegante) {
  try {
    const redirectCrear = esDelegante ? `/encargado/actividades/crear?encargado=${miId}` : '/encargado/actividades/crear';
    const { Nombre_Actividad, ID_Empresa, Nueva_Empresa, Descripcion } = req.body;
    const idTipoActividad = parseInt(req.body.ID_Tipo_Actividad);

    if (!Nombre_Actividad || !Nombre_Actividad.trim()) {
      req.flash('error', 'El nombre de la actividad es obligatorio');
      return res.redirect(redirectCrear);
    }
    if (!Number.isInteger(idTipoActividad)) {
      req.flash('error', 'Selecciona un tipo de actividad');
      return res.redirect(redirectCrear);
    }
    const tipoValido = await prisma.cat_Tipo_Actividad.findUnique({ where: { ID_Tipo_Actividad: idTipoActividad } });
    if (!tipoValido || !tipoValido.Activo) {
      req.flash('error', 'El tipo de actividad seleccionado ya no está disponible');
      return res.redirect(redirectCrear);
    }

    // Body: dias_<idEmpleado>[] = ['1','3'] (checkboxes L-S por fila de empleado).
    const porEmpleado = new Map(); // idEmpleado -> Set<diaSemana>
    for (const key of Object.keys(req.body)) {
      const m = key.match(/^dias_(\d+)$/);
      if (!m) continue;
      const idEmpleado = parseInt(m[1]);
      const valores = Array.isArray(req.body[key]) ? req.body[key] : [req.body[key]];
      const dias = valores.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
      if (dias.length > 0) porEmpleado.set(idEmpleado, new Set(dias));
    }

    if (porEmpleado.size === 0) {
      req.flash('error', 'Marca al menos un día de la semana para al menos un empleado');
      return res.redirect(redirectCrear);
    }

    // Cada empleado debe pertenecer a mi equipo vigente (desde mañana, que es
    // cuando arranca la recurrencia).
    const manana = new Date(); manana.setDate(manana.getDate() + 1); manana.setHours(0, 0, 0, 0);
    for (const idEmpleado of porEmpleado.keys()) {
      if (!(await empleadoEnEquipoDeEncargado(idEmpleado, miId, manana))) {
        req.flash('error', 'Un empleado seleccionado no pertenece a tu equipo vigente');
        return res.redirect(redirectCrear);
      }
    }

    // Resolver empresa: existente o find-or-create por nombre (mismo criterio que puntual)
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
      return res.redirect(redirectCrear);
    }

    // Traslape contra recurrencias activas existentes del mismo empleado+día.
    for (const [idEmpleado, dias] of porEmpleado) {
      for (const dia of dias) {
        if (await hayTraslapeRecurrencia(idEmpleado, dia, manana, null)) {
          req.flash('error', `Ya existe una recurrencia activa los ${NOMBRES_DIA[dia]} para uno de los empleados seleccionados`);
          return res.redirect(redirectCrear);
        }
      }
    }

    const data = [];
    for (const [idEmpleado, dias] of porEmpleado) {
      for (const dia of dias) {
        data.push({
          ID_Empleado: idEmpleado,
          ID_Tipo_Actividad: idTipoActividad,
          Nombre_Actividad: Nombre_Actividad.trim(),
          ID_Empresa: idEmpresa,
          Dia_Semana: dia,
          Fecha_Inicio: manana,
          CreatedBy: req.user.Email_Office365
        });
      }
    }
    await prisma.actividad_Recurrencias.createMany({ data });

    await registrarCambio({
      usuario: req.user,
      accion: 'CREATE',
      tabla: 'Actividad_Recurrencias',
      idRegistro: miId.toString(),
      descripcion: `Recurrencia creada: ${Nombre_Actividad.trim()} [${tipoValido.Nombre}] (${porEmpleado.size} empleado(s))`,
      datosNuevos: { Nombre_Actividad, ID_Tipo_Actividad: idTipoActividad, ID_Empresa: idEmpresa, empleados: [...porEmpleado.keys()] },
      ip: obtenerIP(req)
    });

    for (const idEmpleado of porEmpleado.keys()) {
      try {
        await crearNotificacionParaEmpleado({
          idEmpleado,
          tipo: 'ACTIVIDAD_ASIGNADA',
          titulo: 'Actividad recurrente asignada',
          mensaje: `"${Nombre_Actividad.trim()}" — a partir de mañana, cada semana.`,
          url: '/encargado'
        });
      } catch (err) {
        // best-effort
      }
    }

    req.flash('success', `Recurrencia creada para ${porEmpleado.size} empleado(s)`);
    res.redirect(esDelegante ? `/encargado?encargado=${miId}` : '/encargado');
  } catch (error) {
    next(error);
  }
}

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

    // Cada empleado debe pertenecer al equipo vigente del RESPONSABLE de la
    // actividad (no necesariamente de quien la edita, si es un supervisor).
    for (const f of fechas) {
      const fechaDate = new Date(f);
      for (const empId of subordinados) {
        if (!(await empleadoEnEquipoDeEncargado(empId, actividad.ID_Responsable, fechaDate))) {
          req.flash('error', `Un empleado seleccionado no pertenece al equipo vigente del responsable el ${f}`);
          return res.redirect(`/encargado/actividades/${id}`);
        }
      }
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

    for (const empId of subordinados) {
      try {
        await crearNotificacionParaEmpleado({
          idEmpleado: empId,
          tipo: 'ACTIVIDAD_ASIGNADA',
          titulo: 'Días agregados a una actividad',
          mensaje: `"${actividad.Nombre_Actividad}" — ${fechas.length} día(s) más.`,
          url: `/encargado/actividades/${id}`
        });
      } catch (err) {
        // best-effort
      }
    }

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

// ============================================================
// CALENDARIO EDITABLE (clic en celda = alterna la actividad de ese día)
// ============================================================

// POST /encargado/actividades/toggle
// Body: { ID_Empleado, fecha:'yyyy-mm-dd', modo:'PUNTUAL'|'RECURRENTE',
//         ID_Tipo_Actividad?, ID_Empresa?, Nombre_Actividad? }
// Los 3 últimos solo se requieren cuando el toggle CREA algo.
// Reglas:
//  - Si ya hay puntual ese día -> la quita (la recurrente, si existe, reaparece).
//  - Si no hay puntual pero sí recurrente y modo=RECURRENTE -> detiene la regla.
//  - Si no hay nada -> crea puntual (modo PUNTUAL) o regla semanal (RECURRENTE).
export const toggleCelda = async (req, res, next) => {
  try {
    const esDelegante = esSuperAdminDelegante(req.user);
    const miId = resolverEncargadoEfectivo(req);
    if (!miId) return res.status(400).json({ ok: false, error: 'No se pudo resolver el encargado responsable' });

    const idEmpleado = parseInt(req.body.ID_Empleado);
    const fechaStr = (req.body.fecha || '').trim();
    const modo = req.body.modo === 'RECURRENTE' ? 'RECURRENTE' : 'PUNTUAL';

    if (!Number.isInteger(idEmpleado) || !/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
      return res.status(400).json({ ok: false, error: 'Empleado o fecha inválidos' });
    }
    const fecha = new Date(`${fechaStr}T00:00:00`);
    if (fecha.getDay() === 0) {
      return res.status(400).json({ ok: false, error: 'El domingo no es día laborable' });
    }
    if (!(await empleadoEnEquipoDeEncargado(idEmpleado, miId, fecha))) {
      return res.status(403).json({ ok: false, error: 'Ese empleado no pertenece a tu equipo vigente esa fecha' });
    }

    // 1) ¿Hay una asignación puntual ese día? -> quitarla.
    const puntual = await prisma.actividad_Asignaciones.findFirst({
      where: { ID_Empleado: idEmpleado, Fecha: fecha },
      include: { actividad: { select: { ID_Actividad: true, Nombre_Actividad: true, ID_Responsable: true } } }
    });
    if (puntual) {
      if (puntual.actividad.ID_Responsable !== miId && !esSupervisor(req.user)) {
        return res.status(403).json({ ok: false, error: 'Esa actividad pertenece a otro encargado' });
      }
      await prisma.actividad_Asignaciones.delete({ where: { ID_Asignacion: puntual.ID_Asignacion } });

      // Si la actividad se quedó sin ningún día asignado, se elimina también
      // (evita acumular actividades huérfanas creadas desde el calendario).
      const restantes = await prisma.actividad_Asignaciones.count({ where: { ID_Actividad: puntual.ID_Actividad } });
      if (restantes === 0) {
        await prisma.actividades_Campo.delete({ where: { ID_Actividad: puntual.ID_Actividad } });
      }

      await registrarCambio({
        usuario: req.user,
        accion: 'DELETE',
        tabla: 'Actividad_Asignaciones',
        idRegistro: puntual.ID_Asignacion.toString(),
        descripcion: `Actividad puntual quitada vía calendario: empleado ${idEmpleado}, ${fechaStr}`,
        ip: obtenerIP(req)
      });

      // Puede reaparecer una recurrente que la puntual estaba tapando.
      const resuelto = await resolverActividadesPorRango([idEmpleado], fecha, fecha);
      const reaparece = resuelto.get(`${idEmpleado}_${fechaStr}`) || null;
      return res.json({ ok: true, estado: reaparece ? 'RECURRENTE' : 'VACIO', actividad: reaparece });
    }

    // 2) ¿Hay una recurrente activa que cubra ese día?
    const diaSemana = fecha.getDay();
    const regla = await prisma.actividad_Recurrencias.findFirst({
      where: {
        ID_Empleado: idEmpleado, Dia_Semana: diaSemana, Activo: true,
        Fecha_Inicio: { lte: fecha },
        OR: [{ Fecha_Fin: null }, { Fecha_Fin: { gte: fecha } }]
      }
    });

    if (regla) {
      if (modo === 'RECURRENTE') {
        // Detener la regla completa (soft-stop, no borra histórico).
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const corte = new Date(hoy.getTime() - 24 * 3600 * 1000);
        await prisma.actividad_Recurrencias.update({
          where: { ID_Recurrencia: regla.ID_Recurrencia },
          data: { Fecha_Fin: corte < regla.Fecha_Inicio ? regla.Fecha_Inicio : corte, Activo: false }
        });
        await registrarCambio({
          usuario: req.user,
          accion: 'DELETE',
          tabla: 'Actividad_Recurrencias',
          idRegistro: regla.ID_Recurrencia.toString(),
          descripcion: `Recurrencia detenida vía calendario: empleado ${idEmpleado}, ${NOMBRES_DIA[diaSemana]}`,
          ip: obtenerIP(req)
        });
        return res.json({ ok: true, estado: 'VACIO' });
      }
      return res.status(400).json({
        ok: false,
        error: `Ese día ya está cubierto por una recurrencia (${NOMBRES_DIA[diaSemana]}). Activa el modo "repetir cada semana" para detenerla.`
      });
    }

    // 3) No hay nada: crear.
    const idTipoActividad = parseInt(req.body.ID_Tipo_Actividad);
    const idEmpresa = parseInt(req.body.ID_Empresa);
    const nombreActividad = (req.body.Nombre_Actividad || '').trim();

    if (!Number.isInteger(idTipoActividad) || !Number.isInteger(idEmpresa) || !nombreActividad) {
      return res.status(400).json({ ok: false, error: 'Completa nombre, tipo y empresa antes de asignar días' });
    }
    const tipoValido = await prisma.cat_Tipo_Actividad.findUnique({ where: { ID_Tipo_Actividad: idTipoActividad } });
    if (!tipoValido || !tipoValido.Activo) {
      return res.status(400).json({ ok: false, error: 'El tipo de actividad seleccionado ya no está disponible' });
    }
    const empresaSel = await prisma.cat_Empresas.findUnique({
      where: { ID_Empresa: idEmpresa },
      select: { Nombre_Empresa: true }
    });
    // Payload común para repintar la celda sin recargar la página.
    const infoCelda = (esRecurrente) => ({
      nombre: nombreActividad,
      tipo: tipoValido.Nombre,
      color: tipoValido.Color,
      empresa: empresaSel?.Nombre_Empresa || '',
      esRecurrente
    });

    if (modo === 'RECURRENTE') {
      // La recurrencia arranca en la fecha de la celda clicada.
      const grupoDelEncargado = await prisma.grupos.findFirst({
        where: { Activo: true, encargado: { ID_Empleado: miId }, miembros: { some: { ID_Empleado: idEmpleado, Activo: true } } },
        select: { ID_Grupo: true }
      });
      const nueva = await prisma.actividad_Recurrencias.create({
        data: {
          ID_Empleado: idEmpleado,
          ID_Grupo: grupoDelEncargado?.ID_Grupo ?? null,
          ID_Tipo_Actividad: idTipoActividad,
          Nombre_Actividad: nombreActividad,
          ID_Empresa: idEmpresa,
          Dia_Semana: diaSemana,
          Fecha_Inicio: fecha,
          CreatedBy: req.user.Email_Office365
        }
      });
      await registrarCambio({
        usuario: req.user,
        accion: 'CREATE',
        tabla: 'Actividad_Recurrencias',
        idRegistro: nueva.ID_Recurrencia.toString(),
        descripcion: `Recurrencia creada vía calendario: empleado ${idEmpleado}, ${NOMBRES_DIA[diaSemana]} [${tipoValido.Nombre}]`,
        datosNuevos: { ID_Empleado: idEmpleado, Dia_Semana: diaSemana, ID_Tipo_Actividad: idTipoActividad, Nombre_Actividad: nombreActividad },
        ip: obtenerIP(req)
      });
      return res.json({ ok: true, estado: 'RECURRENTE', actividad: infoCelda(true) });
    }

    // Puntual: reusar una actividad del mismo encargado con igual
    // nombre+tipo+empresa si ya existe, para no crear duplicados por cada clic.
    let actividad = await prisma.actividades_Campo.findFirst({
      where: {
        ID_Responsable: miId,
        Nombre_Actividad: nombreActividad,
        ID_Tipo_Actividad: idTipoActividad,
        ID_Empresa: idEmpresa,
        Activo: true
      }
    });
    if (!actividad) {
      actividad = await prisma.actividades_Campo.create({
        data: {
          Nombre_Actividad: nombreActividad,
          ID_Tipo_Actividad: idTipoActividad,
          ID_Empresa: idEmpresa,
          ID_Responsable: miId,
          CreatedBy: req.user.Email_Office365
        }
      });
    }

    await prisma.actividad_Asignaciones.create({
      data: { ID_Actividad: actividad.ID_Actividad, ID_Empleado: idEmpleado, Fecha: fecha, CreatedBy: req.user.Email_Office365 }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'CREATE',
      tabla: 'Actividad_Asignaciones',
      idRegistro: actividad.ID_Actividad.toString(),
      descripcion: `Actividad puntual asignada vía calendario: empleado ${idEmpleado}, ${fechaStr} [${tipoValido.Nombre}]`,
      datosNuevos: { ID_Empleado: idEmpleado, Fecha: fechaStr, ID_Tipo_Actividad: idTipoActividad, Nombre_Actividad: nombreActividad },
      ip: obtenerIP(req)
    });

    res.json({ ok: true, estado: 'PUNTUAL', actividad: infoCelda(false) });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ ok: false, error: 'Ese empleado ya tiene una actividad asignada ese día' });
    }
    next(error);
  }
};

export default {
  index,
  crear,
  store,
  ver,
  agregarAsignacion,
  quitarAsignacion,
  toggleCelda
};
