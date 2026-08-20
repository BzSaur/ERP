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
            empresas: [], tiposActividad: [], actividadesDelRango: [], recurrenciasDelRango: [],
            nombresDia: NOMBRES_DIA,
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

    // Actividades puntuales con días en el rango: dan acceso a su pantalla de
    // detalle para editarlas (nombre/tipo/empresa) sin pasar por las celdas.
    const actividadesDelRango = await prisma.actividades_Campo.findMany({
      where: {
        ID_Responsable: miId,
        asignaciones: { some: { Fecha: { gte: inicio, lte: fin } } }
      },
      include: {
        empresa: { select: { Nombre_Empresa: true } },
        tipo_actividad: { select: { Nombre: true, Color: true } },
        _count: { select: { asignaciones: true } }
      },
      orderBy: { CreatedAt: 'desc' }
    });

    // Reglas recurrentes vigentes del equipo, agrupadas por
    // empleado+nombre+tipo+empresa (cada día de semana es una fila distinta).
    const reglasEquipo = equipo.length
      ? await prisma.actividad_Recurrencias.findMany({
          where: {
            ID_Empleado: { in: equipo.map(e => e.ID_Empleado) },
            Activo: true,
            Fecha_Inicio: { lte: fin },
            OR: [{ Fecha_Fin: null }, { Fecha_Fin: { gte: inicio } }]
          },
          include: {
            empleado: { select: { Nombre: true, Apellido_Paterno: true } },
            empresa: { select: { Nombre_Empresa: true } },
            tipo_actividad: { select: { Nombre: true, Color: true } }
          },
          orderBy: [{ ID_Empleado: 'asc' }, { Dia_Semana: 'asc' }]
        })
      : [];

    const porRegla = new Map();
    for (const r of reglasEquipo) {
      const clave = `${r.ID_Empleado}_${r.Nombre_Actividad}_${r.ID_Tipo_Actividad}_${r.ID_Empresa}`;
      if (!porRegla.has(clave)) {
        porRegla.set(clave, {
          ID_Recurrencia: r.ID_Recurrencia, // cualquiera de las hermanas sirve de ancla
          nombre: r.Nombre_Actividad,
          empleado: [r.empleado.Nombre, r.empleado.Apellido_Paterno].filter(Boolean).join(' '),
          empresa: r.empresa.Nombre_Empresa,
          tipo: r.tipo_actividad.Nombre,
          color: r.tipo_actividad.Color,
          dias: []
        });
      }
      porRegla.get(clave).dias.push(r.Dia_Semana);
    }
    const recurrenciasDelRango = [...porRegla.values()];

    res.render('encargado/index', {
      title: 'Actividades de Campo',
      equipo, fechas, celdas,
      empresas, tiposActividad, actividadesDelRango, recurrenciasDelRango,
      nombresDia: NOMBRES_DIA,
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
          ID_Responsable: miId,
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
        tipo_actividad: { select: { ID_Tipo_Actividad: true, Nombre: true, Color: true } },
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
      const fmtMin = (m) => Number.isFinite(m)
        ? String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
        : '';
      porEmpleado.get(key).dias.push({
        ID_Asignacion: asig.ID_Asignacion,
        fecha: fechaStr,
        sello: !!(sello && sello.Hora_Entrada),
        // Tramo horario capturado para ese día (vacío = jornada implícita).
        horaInicio: fmtMin(asig.Hora_Inicio),
        horaFin: fmtMin(asig.Hora_Fin),
        tieneTramo: Number.isFinite(asig.Hora_Inicio) && Number.isFinite(asig.Hora_Fin)
      });
    }

    // Catálogos + equipo vigente del responsable, para el form de edición y
    // para la matriz de días (permite agregar empleados que aún no están).
    const [tiposActividad, empresas, equipo] = await Promise.all([
      prisma.cat_Tipo_Actividad.findMany({ where: { Activo: true }, orderBy: { Nombre: 'asc' } }),
      prisma.cat_Empresas.findMany({ where: { Activo: true }, orderBy: { Nombre_Empresa: 'asc' } }),
      obtenerEquipoVigente(actividad.ID_Responsable)
    ]);

    // Empleados que ofrece el alta en bloque: el equipo vigente, más los que
    // ya tienen días aquí aunque hayan salido del equipo (para verlos listados).
    const empleadosMatriz = [...equipo];
    for (const fila of porEmpleado.values()) {
      if (!empleadosMatriz.some(e => e.ID_Empleado === fila.empleado.ID_Empleado)) {
        empleadosMatriz.push({ ...fila.empleado, fueraDelEquipo: true });
      }
    }

    res.render('encargado/detalle', {
      title: actividad.Nombre_Actividad,
      actividad,
      filas: [...porEmpleado.values()],
      esSupervisor: supervisor,
      puedeEditar: supervisor || actividad.ID_Responsable === req.user.ID_Empleado,
      tiposActividad, empresas,
      empleadosMatriz
    });
  } catch (error) {
    next(error);
  }
};

// POST /encargado/actividades/:id - Actualizar datos de la actividad.
// Afecta a TODOS sus días: es la misma fila de Actividades_Campo.
export const actualizar = async (req, res, next) => {
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

    const { Nombre_Actividad, Descripcion } = req.body;
    const idTipoActividad = parseInt(req.body.ID_Tipo_Actividad);
    const idEmpresa = parseInt(req.body.ID_Empresa);

    if (!Nombre_Actividad?.trim() || !Number.isInteger(idTipoActividad) || !Number.isInteger(idEmpresa)) {
      req.flash('error', 'Nombre, tipo y empresa son obligatorios');
      return res.redirect(`/encargado/actividades/${id}`);
    }
    const tipoValido = await prisma.cat_Tipo_Actividad.findUnique({ where: { ID_Tipo_Actividad: idTipoActividad } });
    if (!tipoValido || !tipoValido.Activo) {
      req.flash('error', 'El tipo de actividad seleccionado ya no está disponible');
      return res.redirect(`/encargado/actividades/${id}`);
    }

    const actualizada = await prisma.actividades_Campo.update({
      where: { ID_Actividad: id },
      data: {
        Nombre_Actividad: Nombre_Actividad.trim(),
        ID_Tipo_Actividad: idTipoActividad,
        ID_Empresa: idEmpresa,
        Descripcion: Descripcion?.trim() || null
      }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'Actividades_Campo',
      idRegistro: id.toString(),
      descripcion: `Actividad actualizada: ${actualizada.Nombre_Actividad}`,
      datosPrevios: {
        Nombre_Actividad: actividad.Nombre_Actividad,
        ID_Tipo_Actividad: actividad.ID_Tipo_Actividad,
        ID_Empresa: actividad.ID_Empresa,
        Descripcion: actividad.Descripcion
      },
      datosNuevos: {
        Nombre_Actividad: actualizada.Nombre_Actividad,
        ID_Tipo_Actividad: actualizada.ID_Tipo_Actividad,
        ID_Empresa: actualizada.ID_Empresa,
        Descripcion: actualizada.Descripcion
      },
      ip: obtenerIP(req)
    });

    req.flash('success', 'Actividad actualizada — el cambio aplica a todos sus días');
    res.redirect(`/encargado/actividades/${id}`);
  } catch (error) {
    next(error);
  }
};

// POST /encargado/actividades/:id/eliminar - Borra la actividad y TODOS sus
// días asignados (las asignaciones caen por ON DELETE CASCADE).
export const eliminar = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const actividad = await prisma.actividades_Campo.findUnique({
      where: { ID_Actividad: id },
      include: { _count: { select: { asignaciones: true } } }
    });
    if (!actividad) {
      req.flash('error', 'Actividad no encontrada');
      return res.redirect('/encargado');
    }
    if (actividad.ID_Responsable !== req.user.ID_Empleado && !esSupervisor(req.user)) {
      return res.status(403).render('errors/403', { title: 'Acceso Denegado', message: 'Esta actividad no te pertenece' });
    }

    await prisma.actividades_Campo.delete({ where: { ID_Actividad: id } });

    await registrarCambio({
      usuario: req.user,
      accion: 'DELETE',
      tabla: 'Actividades_Campo',
      idRegistro: id.toString(),
      descripcion: `Actividad eliminada: ${actividad.Nombre_Actividad} (${actividad._count.asignaciones} día(s) asignado(s))`,
      datosPrevios: { Nombre_Actividad: actividad.Nombre_Actividad, ID_Empresa: actividad.ID_Empresa },
      ip: obtenerIP(req)
    });

    req.flash('success', `Actividad eliminada junto con sus ${actividad._count.asignaciones} día(s)`);
    res.redirect('/encargado');
  } catch (error) {
    next(error);
  }
};

// POST /encargado/actividades/:id/dias - Guarda la matriz completa de días de
// esta actividad: recibe la lista de pares empleado+fecha que deben quedar
// asignados y calcula el delta (alta de los nuevos, baja de los quitados).
export const guardarDias = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const actividad = await prisma.actividades_Campo.findUnique({
      where: { ID_Actividad: id },
      include: { asignaciones: { select: { ID_Asignacion: true, ID_Empleado: true, Fecha: true } } }
    });
    if (!actividad) return res.status(404).json({ ok: false, error: 'Actividad no encontrada' });
    if (actividad.ID_Responsable !== req.user.ID_Empleado && !esSupervisor(req.user)) {
      return res.status(403).json({ ok: false, error: 'Esta actividad no te pertenece' });
    }

    // Body: celdas = ["46_2026-08-17", "2_2026-08-18", ...]
    const deseadas = new Set(
      (Array.isArray(req.body.celdas) ? req.body.celdas : [])
        .filter(k => /^\d+_\d{4}-\d{2}-\d{2}$/.test(k))
    );
    const actuales = new Map(
      actividad.asignaciones.map(a => [`${a.ID_Empleado}_${fmtFecha(a.Fecha)}`, a.ID_Asignacion])
    );

    const aAgregar = [...deseadas].filter(k => !actuales.has(k));
    const aQuitar = [...actuales.entries()].filter(([k]) => !deseadas.has(k)).map(([, idAsig]) => idAsig);

    if (aAgregar.length === 0 && aQuitar.length === 0) {
      return res.json({ ok: true, agregados: 0, quitados: 0, sinCambios: true });
    }

    // Validar pertenencia al equipo y choque con otra actividad, por cada alta.
    const conflictos = [];
    const nuevas = [];
    for (const key of aAgregar) {
      const [empStr, fechaStr] = key.split('_');
      const idEmpleado = parseInt(empStr);
      const fecha = new Date(`${fechaStr}T00:00:00`);
      if (fecha.getDay() === 0) continue; // domingo: se ignora

      if (!(await empleadoEnEquipoDeEncargado(idEmpleado, actividad.ID_Responsable, fecha))) {
        conflictos.push(`${fechaStr}: el empleado no pertenece al equipo vigente`);
        continue;
      }
      const ocupado = await prisma.actividad_Asignaciones.findFirst({
        where: { ID_Empleado: idEmpleado, Fecha: fecha },
        include: { actividad: { select: { Nombre_Actividad: true } } }
      });
      if (ocupado) {
        conflictos.push(`${fechaStr}: ya tiene "${ocupado.actividad.Nombre_Actividad}"`);
        continue;
      }
      nuevas.push({ ID_Actividad: id, ID_Empleado: idEmpleado, Fecha: fecha, CreatedBy: req.user.Email_Office365 });
    }

    await prisma.$transaction(async (tx) => {
      if (aQuitar.length) await tx.actividad_Asignaciones.deleteMany({ where: { ID_Asignacion: { in: aQuitar } } });
      if (nuevas.length) await tx.actividad_Asignaciones.createMany({ data: nuevas });
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'Actividad_Asignaciones',
      idRegistro: id.toString(),
      descripcion: `Días de "${actividad.Nombre_Actividad}": +${nuevas.length} / -${aQuitar.length}`,
      ip: obtenerIP(req)
    });

    res.json({ ok: true, agregados: nuevas.length, quitados: aQuitar.length, conflictos });
  } catch (error) {
    next(error);
  }
};

// POST /encargado/actividades/:id/asignaciones/lote-eliminar - Quita en bloque
// los días marcados con checkbox en la tabla de detalle.
export const quitarAsignacionesLote = async (req, res, next) => {
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

    const ids = (req.body.asignaciones == null ? [] : Array.isArray(req.body.asignaciones) ? req.body.asignaciones : [req.body.asignaciones])
      .map(Number).filter(Number.isInteger);

    if (ids.length === 0) {
      req.flash('error', 'Selecciona al menos un día');
      return res.redirect(`/encargado/actividades/${id}`);
    }

    const { count } = await prisma.actividad_Asignaciones.deleteMany({
      where: { ID_Asignacion: { in: ids }, ID_Actividad: id }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'DELETE',
      tabla: 'Actividad_Asignaciones',
      idRegistro: id.toString(),
      descripcion: `${count} día(s) quitado(s) en lote de "${actividad.Nombre_Actividad}"`,
      ip: obtenerIP(req)
    });

    req.flash('success', `${count} día(s) quitado(s)`);
    res.redirect(`/encargado/actividades/${id}`);
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

    // Días: lista suelta ("dias") o rango completo (Rango_Desde/Rango_Hasta,
    // que expande todos los laborables del intervalo, sin domingos).
    let fechas = (req.body.dias || '').split(',').map(s => s.trim()).filter(Boolean);
    if (req.body.Rango_Desde && req.body.Rango_Hasta) {
      const desde = new Date(`${req.body.Rango_Desde}T00:00:00`);
      const hasta = new Date(`${req.body.Rango_Hasta}T00:00:00`);
      if (!isNaN(desde) && !isNaN(hasta) && desde <= hasta) {
        const delRango = [];
        for (let d = new Date(desde); d <= hasta; d.setDate(d.getDate() + 1)) {
          if (d.getDay() === 0) continue; // domingo no laborable
          delRango.push(d.toISOString().slice(0, 10));
        }
        fechas = [...new Set([...fechas, ...delRango])];
      }
    }

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
    // `agregar: true` pide SUMAR otra actividad al día en vez de reemplazar la
    // que ya está (ej. home office por la mañana + capacitación por la tarde).
    const modoAgregar = req.body.agregar === true || req.body.agregar === 'true';

    const puntual = modoAgregar ? null : await prisma.actividad_Asignaciones.findFirst({
      where: { ID_Empleado: idEmpleado, Fecha: fecha },
      include: { actividad: { select: { ID_Actividad: true, Nombre_Actividad: true, ID_Responsable: true } } }
    });
    if (puntual) {
      if (puntual.actividad.ID_Responsable !== miId && !esSupervisor(req.user)) {
        return res.status(403).json({ ok: false, error: 'Esa actividad pertenece a otro encargado' });
      }

      // Si vienen datos de actividad Y son distintos a los actuales, es un
      // REEMPLAZO (el usuario quiere cambiarle la actividad a ese día), no un
      // "quitar". Se mueve el día a la actividad nueva sin borrar nada más.
      const nomNuevo = (req.body.Nombre_Actividad || '').trim();
      const tipoNuevo = parseInt(req.body.ID_Tipo_Actividad);
      const empNuevo = parseInt(req.body.ID_Empresa);
      const traeDatos = nomNuevo && Number.isInteger(tipoNuevo) && Number.isInteger(empNuevo);
      const esOtraActividad = traeDatos && (
        nomNuevo !== puntual.actividad.Nombre_Actividad ||
        tipoNuevo !== puntual.actividad.ID_Tipo_Actividad ||
        empNuevo !== puntual.actividad.ID_Empresa
      );

      if (esOtraActividad && modo === 'PUNTUAL') {
        const tipoOk = await prisma.cat_Tipo_Actividad.findUnique({ where: { ID_Tipo_Actividad: tipoNuevo } });
        if (!tipoOk || !tipoOk.Activo) {
          return res.status(400).json({ ok: false, error: 'El tipo de actividad seleccionado ya no está disponible' });
        }
        // Reusar una actividad igual del mismo encargado, o crearla.
        let destino = await prisma.actividades_Campo.findFirst({
          where: {
            ID_Responsable: miId, Nombre_Actividad: nomNuevo,
            ID_Tipo_Actividad: tipoNuevo, ID_Empresa: empNuevo, Activo: true
          }
        });
        if (!destino) {
          destino = await prisma.actividades_Campo.create({
            data: {
              Nombre_Actividad: nomNuevo, ID_Tipo_Actividad: tipoNuevo,
              ID_Empresa: empNuevo, ID_Responsable: miId, CreatedBy: req.user.Email_Office365
            }
          });
        }

        // Horario que venga en el reemplazo; si no, se limpia el anterior
        // (pertenecía a la actividad que se está sustituyendo).
        const aMinR = (hhmm) => {
          if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
          const [h, m] = hhmm.split(':').map(Number);
          return (h > 23 || m > 59) ? null : h * 60 + m;
        };
        const hIniR = aMinR(req.body.Hora_Inicio);
        const hFinR = aMinR(req.body.Hora_Fin);

        await prisma.actividad_Asignaciones.update({
          where: { ID_Asignacion: puntual.ID_Asignacion },
          data: {
            ID_Actividad: destino.ID_Actividad,
            Hora_Inicio: (hIniR != null && hFinR != null && hFinR > hIniR) ? hIniR : null,
            Hora_Fin: (hIniR != null && hFinR != null && hFinR > hIniR) ? hFinR : null
          }
        });

        // La actividad anterior puede quedarse sin días.
        const quedan = await prisma.actividad_Asignaciones.count({ where: { ID_Actividad: puntual.ID_Actividad } });
        if (quedan === 0) {
          await prisma.actividades_Campo.delete({ where: { ID_Actividad: puntual.ID_Actividad } });
        }

        await registrarCambio({
          usuario: req.user,
          accion: 'UPDATE',
          tabla: 'Actividad_Asignaciones',
          idRegistro: puntual.ID_Asignacion.toString(),
          descripcion: `Actividad del ${fechaStr} cambiada: "${puntual.actividad.Nombre_Actividad}" → "${nomNuevo}" (empleado ${idEmpleado})`,
          ip: obtenerIP(req)
        });

        const empresaSel = await prisma.cat_Empresas.findUnique({
          where: { ID_Empresa: empNuevo }, select: { Nombre_Empresa: true }
        });
        return res.json({
          ok: true, estado: 'PUNTUAL', reemplazada: true,
          actividad: {
            ID_Actividad: destino.ID_Actividad, ID_Asignacion: puntual.ID_Asignacion,
            nombre: nomNuevo, tipo: tipoOk.Nombre, color: tipoOk.Color,
            empresa: empresaSel?.Nombre_Empresa || '', esRecurrente: false
          }
        });
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
      // Modo PUNTUAL sobre un día que cubre una recurrencia: NO es un error.
      // La puntual siempre gana sobre la regla (así se resuelve en consulta),
      // así que se deja crear encima — la recurrencia sigue aplicando el resto
      // de las semanas. Cae al bloque 3 para crearla.
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

    // Tramo horario opcional ('HH:MM' -> minutos). Solo aplica a puntuales:
    // una regla recurrente no materializa un día con horario propio.
    const aMin = (hhmm) => {
      if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
      const [h, m] = hhmm.split(':').map(Number);
      if (h > 23 || m > 59) return null;
      return h * 60 + m;
    };
    const horaInicioMin = modo === 'PUNTUAL' ? aMin(req.body.Hora_Inicio) : null;
    const horaFinMin = modo === 'PUNTUAL' ? aMin(req.body.Hora_Fin) : null;
    if ((horaInicioMin == null) !== (horaFinMin == null)) {
      return res.status(400).json({ ok: false, error: 'Captura ambas horas, o deja las dos vacías' });
    }
    if (horaInicioMin != null && horaFinMin <= horaInicioMin) {
      return res.status(400).json({ ok: false, error: 'La hora de fin debe ser posterior a la de inicio' });
    }
    // Al sumar una segunda actividad al día, el tramo es obligatorio: sin él
    // no se sabría cuánto aporta cada una.
    if (modoAgregar && horaInicioMin == null) {
      return res.status(400).json({ ok: false, error: 'Para agregar otra actividad al día, captura su horario' });
    }

    // Payload común para repintar la celda sin recargar la página.
    const infoCelda = (esRecurrente) => ({
      nombre: nombreActividad,
      tipo: tipoValido.Nombre,
      color: tipoValido.Color,
      empresa: empresaSel?.Nombre_Empresa || '',
      horaInicio: esRecurrente ? null : horaInicioMin,
      horaFin: esRecurrente ? null : horaFinMin,
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
          // Se guarda siempre, aunque no haya grupo: es lo que permite mostrar
          // el encargado en las tablas de asistencia.
          ID_Responsable: miId,
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
      data: {
        ID_Actividad: actividad.ID_Actividad, ID_Empleado: idEmpleado, Fecha: fecha,
        // Tramo horario opcional capturado en el mismo paso de creación.
        Hora_Inicio: horaInicioMin, Hora_Fin: horaFinMin,
        CreatedBy: req.user.Email_Office365
      }
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

// POST /encargado/actividades/:id/datos - Igual que `actualizar` pero
// responde JSON, para el panel lateral de Asistencia de mi Equipo. Cambia los
// datos de la actividad SIN tocar sus días (no borra ni recrea asignaciones).
export const actualizarDatosJson = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const actividad = await prisma.actividades_Campo.findUnique({ where: { ID_Actividad: id } });
    if (!actividad) return res.status(404).json({ ok: false, error: 'Actividad no encontrada' });
    if (actividad.ID_Responsable !== req.user.ID_Empleado && !esSupervisor(req.user)) {
      return res.status(403).json({ ok: false, error: 'Esta actividad no te pertenece' });
    }

    const nombre = (req.body.Nombre_Actividad || '').trim();
    const idTipoActividad = parseInt(req.body.ID_Tipo_Actividad);
    const idEmpresa = parseInt(req.body.ID_Empresa);
    if (!nombre || !Number.isInteger(idTipoActividad) || !Number.isInteger(idEmpresa)) {
      return res.status(400).json({ ok: false, error: 'Completa nombre, tipo y empresa' });
    }
    const tipoValido = await prisma.cat_Tipo_Actividad.findUnique({ where: { ID_Tipo_Actividad: idTipoActividad } });
    if (!tipoValido || !tipoValido.Activo) {
      return res.status(400).json({ ok: false, error: 'El tipo de actividad seleccionado ya no está disponible' });
    }

    const nDias = await prisma.actividad_Asignaciones.count({ where: { ID_Actividad: id } });
    const actualizada = await prisma.actividades_Campo.update({
      where: { ID_Actividad: id },
      data: { Nombre_Actividad: nombre, ID_Tipo_Actividad: idTipoActividad, ID_Empresa: idEmpresa }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'Actividades_Campo',
      idRegistro: id.toString(),
      descripcion: `Actividad actualizada desde el panel: ${actualizada.Nombre_Actividad}`,
      datosPrevios: { Nombre_Actividad: actividad.Nombre_Actividad, ID_Tipo_Actividad: actividad.ID_Tipo_Actividad, ID_Empresa: actividad.ID_Empresa },
      datosNuevos: { Nombre_Actividad: nombre, ID_Tipo_Actividad: idTipoActividad, ID_Empresa: idEmpresa },
      ip: obtenerIP(req)
    });

    res.json({ ok: true, diasAfectados: nDias, nombre: actualizada.Nombre_Actividad });
  } catch (error) {
    next(error);
  }
};

// POST /encargado/actividades/:id/asignaciones/:idAsignacion/horas
// Captura (o limpia) el tramo horario de UN día concreto de la actividad.
// Body: { Hora_Inicio:'HH:MM', Hora_Fin:'HH:MM' } — ambos vacíos = jornada
// implícita (9h fijas sin checada, u 8:00→primera checada con ella).
export const guardarHorasDia = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const idAsignacion = parseInt(req.params.idAsignacion);

    const asignacion = await prisma.actividad_Asignaciones.findUnique({
      where: { ID_Asignacion: idAsignacion },
      include: { actividad: { select: { ID_Actividad: true, ID_Responsable: true, Nombre_Actividad: true } } }
    });
    if (!asignacion || asignacion.ID_Actividad !== id) {
      req.flash('error', 'Día no encontrado en esta actividad');
      return res.redirect(`/encargado/actividades/${id}`);
    }
    if (asignacion.actividad.ID_Responsable !== req.user.ID_Empleado && !esSupervisor(req.user)) {
      return res.status(403).render('errors/403', { title: 'Acceso Denegado', message: 'Esta actividad no te pertenece' });
    }

    // 'HH:MM' -> minutos desde medianoche; vacío -> null.
    const aMinutos = (hhmm) => {
      if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
      const [h, m] = hhmm.split(':').map(Number);
      if (h > 23 || m > 59) return null;
      return h * 60 + m;
    };
    const ini = aMinutos(req.body.Hora_Inicio);
    const fin = aMinutos(req.body.Hora_Fin);

    // O ambos, o ninguno: un solo extremo no define un tramo.
    if ((ini == null) !== (fin == null)) {
      req.flash('error', 'Captura la hora de inicio y la de fin, o deja ambas vacías');
      return res.redirect(`/encargado/actividades/${id}`);
    }
    if (ini != null && fin <= ini) {
      req.flash('error', 'La hora de fin debe ser posterior a la de inicio');
      return res.redirect(`/encargado/actividades/${id}`);
    }

    await prisma.actividad_Asignaciones.update({
      where: { ID_Asignacion: idAsignacion },
      data: { Hora_Inicio: ini, Hora_Fin: fin }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'Actividad_Asignaciones',
      idRegistro: idAsignacion.toString(),
      descripcion: ini == null
        ? `Horas del día ${fmtFecha(asignacion.Fecha)} devueltas a jornada implícita ("${asignacion.actividad.Nombre_Actividad}")`
        : `Horas del día ${fmtFecha(asignacion.Fecha)}: ${req.body.Hora_Inicio}–${req.body.Hora_Fin} ("${asignacion.actividad.Nombre_Actividad}")`,
      datosPrevios: { Hora_Inicio: asignacion.Hora_Inicio, Hora_Fin: asignacion.Hora_Fin },
      datosNuevos: { Hora_Inicio: ini, Hora_Fin: fin },
      ip: obtenerIP(req)
    });

    req.flash('success', ini == null ? 'Día devuelto a jornada completa' : 'Horas del día actualizadas');
    res.redirect(`/encargado/actividades/${id}`);
  } catch (error) {
    next(error);
  }
};

// POST /encargado/actividades/asignacion/:idAsignacion/horas-json
// Igual que guardarHorasDia pero responde JSON, para el panel lateral de
// Asistencia de mi Equipo: ahí es donde se ve la checada real y se le agrega
// el tramo de actividad que la complementa.
export const guardarHorasDiaJson = async (req, res, next) => {
  try {
    const idAsignacion = parseInt(req.params.idAsignacion);
    const asignacion = await prisma.actividad_Asignaciones.findUnique({
      where: { ID_Asignacion: idAsignacion },
      include: { actividad: { select: { ID_Responsable: true, Nombre_Actividad: true } } }
    });
    if (!asignacion) return res.status(404).json({ ok: false, error: 'Día no encontrado' });
    if (asignacion.actividad.ID_Responsable !== req.user.ID_Empleado && !esSupervisor(req.user)) {
      return res.status(403).json({ ok: false, error: 'Esa actividad no te pertenece' });
    }

    const aMinutos = (hhmm) => {
      if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
      const [h, m] = hhmm.split(':').map(Number);
      if (h > 23 || m > 59) return null;
      return h * 60 + m;
    };
    const ini = aMinutos(req.body.Hora_Inicio);
    const fin = aMinutos(req.body.Hora_Fin);

    if ((ini == null) !== (fin == null)) {
      return res.status(400).json({ ok: false, error: 'Captura ambas horas, o deja las dos vacías' });
    }
    if (ini != null && fin <= ini) {
      return res.status(400).json({ ok: false, error: 'La hora de fin debe ser posterior a la de inicio' });
    }

    await prisma.actividad_Asignaciones.update({
      where: { ID_Asignacion: idAsignacion },
      data: { Hora_Inicio: ini, Hora_Fin: fin }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'Actividad_Asignaciones',
      idRegistro: idAsignacion.toString(),
      descripcion: ini == null
        ? `Horas del ${fmtFecha(asignacion.Fecha)} devueltas a jornada implícita ("${asignacion.actividad.Nombre_Actividad}")`
        : `Horas del ${fmtFecha(asignacion.Fecha)}: ${req.body.Hora_Inicio}–${req.body.Hora_Fin} ("${asignacion.actividad.Nombre_Actividad}")`,
      datosPrevios: { Hora_Inicio: asignacion.Hora_Inicio, Hora_Fin: asignacion.Hora_Fin },
      datosNuevos: { Hora_Inicio: ini, Hora_Fin: fin },
      ip: obtenerIP(req)
    });

    res.json({ ok: true, horaInicio: ini, horaFin: fin });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// RECURRENCIAS — detalle y edición
// Cada día de la semana es una FILA distinta en Actividad_Recurrencias. Una
// "regla" para el usuario es el conjunto de filas activas del mismo empleado
// que comparten nombre+tipo+empresa; se identifican por el ID de cualquiera
// de ellas y se editan en bloque.
// ============================================================

// Devuelve las filas hermanas de una regla (mismo empleado, nombre, tipo y
// empresa, todas activas), ordenadas por día de la semana.
async function filasDeLaRegla(regla) {
  return prisma.actividad_Recurrencias.findMany({
    where: {
      ID_Empleado: regla.ID_Empleado,
      Nombre_Actividad: regla.Nombre_Actividad,
      ID_Tipo_Actividad: regla.ID_Tipo_Actividad,
      ID_Empresa: regla.ID_Empresa,
      Activo: true
    },
    orderBy: { Dia_Semana: 'asc' }
  });
}

// GET /encargado/recurrencias/:id - Detalle de una regla recurrente
export const verRecurrencia = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const regla = await prisma.actividad_Recurrencias.findUnique({
      where: { ID_Recurrencia: id },
      include: {
        empleado: { select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true, area: { select: { Nombre_Area: true } } } },
        empresa: { select: { ID_Empresa: true, Nombre_Empresa: true } },
        tipo_actividad: { select: { ID_Tipo_Actividad: true, Nombre: true, Color: true } },
        grupo: { select: { ID_Grupo: true, Nombre_Grupo: true, encargado: { select: { ID_Empleado: true } } } }
      }
    });

    if (!regla) {
      req.flash('error', 'Recurrencia no encontrada');
      return res.redirect('/encargado');
    }

    // Permiso: el empleado debe estar en el equipo vigente de quien edita
    // (o ser supervisor). La regla no guarda responsable propio.
    const supervisor = esSupervisor(req.user);
    const miId = req.user.ID_Empleado;
    const puedeEditar = supervisor ||
      (miId ? await empleadoEnEquipoDeEncargado(regla.ID_Empleado, miId, new Date()) : false);
    if (!puedeEditar) {
      return res.status(403).render('errors/403', { title: 'Acceso Denegado', message: 'Esa recurrencia no pertenece a tu equipo' });
    }

    const hermanas = await filasDeLaRegla(regla);
    const [tiposActividad, empresas] = await Promise.all([
      prisma.cat_Tipo_Actividad.findMany({ where: { Activo: true }, orderBy: { Nombre: 'asc' } }),
      prisma.cat_Empresas.findMany({ where: { Activo: true }, orderBy: { Nombre_Empresa: 'asc' } })
    ]);

    const fmtInput = (d) => d ? new Date(d).toISOString().slice(0, 10) : '';

    res.render('encargado/recurrencia-detalle', {
      title: `Recurrencia: ${regla.Nombre_Actividad}`,
      regla,
      diasActivos: hermanas.map(h => h.Dia_Semana),
      hermanas,
      tiposActividad, empresas,
      puedeEditar: true,
      // La vigencia se toma de la fila abierta; al guardar se aplica a todas.
      fechaInicio: fmtInput(regla.Fecha_Inicio),
      fechaFin: fmtInput(regla.Fecha_Fin),
      nombresDia: NOMBRES_DIA
    });
  } catch (error) {
    next(error);
  }
};

// POST /encargado/recurrencias/:id - Actualiza la regla completa: datos,
// días de la semana (alta/baja de filas hermanas) y vigencia.
export const actualizarRecurrencia = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const regla = await prisma.actividad_Recurrencias.findUnique({ where: { ID_Recurrencia: id } });
    if (!regla) {
      req.flash('error', 'Recurrencia no encontrada');
      return res.redirect('/encargado');
    }

    const supervisor = esSupervisor(req.user);
    const miId = req.user.ID_Empleado;
    const permitido = supervisor ||
      (miId ? await empleadoEnEquipoDeEncargado(regla.ID_Empleado, miId, new Date()) : false);
    if (!permitido) {
      return res.status(403).render('errors/403', { title: 'Acceso Denegado', message: 'Esa recurrencia no pertenece a tu equipo' });
    }

    const volver = `/encargado/recurrencias/${id}`;
    const { Nombre_Actividad } = req.body;
    const idTipoActividad = parseInt(req.body.ID_Tipo_Actividad);
    const idEmpresa = parseInt(req.body.ID_Empresa);
    const fechaInicio = req.body.Fecha_Inicio ? new Date(`${req.body.Fecha_Inicio}T00:00:00`) : null;
    const fechaFin = req.body.Fecha_Fin ? new Date(`${req.body.Fecha_Fin}T00:00:00`) : null;
    const dias = (Array.isArray(req.body.Dia_Semana) ? req.body.Dia_Semana : [req.body.Dia_Semana])
      .filter(Boolean).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6);

    if (!Nombre_Actividad?.trim() || !Number.isInteger(idTipoActividad) || !Number.isInteger(idEmpresa) || !fechaInicio) {
      req.flash('error', 'Nombre, tipo, empresa y fecha de inicio son obligatorios');
      return res.redirect(volver);
    }
    if (dias.length === 0) {
      req.flash('error', 'Marca al menos un día de la semana (o usa "Detener regla" para darla de baja)');
      return res.redirect(volver);
    }
    if (fechaFin && fechaFin < fechaInicio) {
      req.flash('error', 'La fecha de fin no puede ser anterior a la de inicio');
      return res.redirect(volver);
    }
    const tipoValido = await prisma.cat_Tipo_Actividad.findUnique({ where: { ID_Tipo_Actividad: idTipoActividad } });
    if (!tipoValido || !tipoValido.Activo) {
      req.flash('error', 'El tipo de actividad seleccionado ya no está disponible');
      return res.redirect(volver);
    }

    const hermanas = await filasDeLaRegla(regla);
    const diasActuales = new Set(hermanas.map(h => h.Dia_Semana));
    const diasNuevos = new Set(dias);

    // Traslape: solo contra reglas ACTIVAS de OTRO conjunto (las hermanas
    // propias no cuentan, se están reescribiendo aquí).
    const idsHermanas = hermanas.map(h => h.ID_Recurrencia);
    for (const dia of [...diasNuevos].filter(d => !diasActuales.has(d))) {
      const choque = await prisma.actividad_Recurrencias.findFirst({
        where: {
          ID_Empleado: regla.ID_Empleado,
          Dia_Semana: dia,
          Activo: true,
          ID_Recurrencia: { notIn: idsHermanas },
          Fecha_Inicio: { lte: fechaFin ?? new Date('9999-12-31') },
          OR: [{ Fecha_Fin: null }, { Fecha_Fin: { gte: fechaInicio } }]
        }
      });
      if (choque) {
        req.flash('error', `Ya existe otra recurrencia activa los ${NOMBRES_DIA[dia]} para ese empleado en esas fechas`);
        return res.redirect(volver);
      }
    }

    const datosComunes = {
      Nombre_Actividad: Nombre_Actividad.trim(),
      ID_Tipo_Actividad: idTipoActividad,
      ID_Empresa: idEmpresa,
      Fecha_Inicio: fechaInicio,
      Fecha_Fin: fechaFin
    };

    await prisma.$transaction(async (tx) => {
      // Días que se quedan: actualizar datos y vigencia.
      const seQuedan = hermanas.filter(h => diasNuevos.has(h.Dia_Semana)).map(h => h.ID_Recurrencia);
      if (seQuedan.length) {
        await tx.actividad_Recurrencias.updateMany({
          where: { ID_Recurrencia: { in: seQuedan } },
          data: datosComunes
        });
      }
      // Días quitados: baja real (la regla nunca llegó a aplicar ese día si se
      // desmarca aquí; a diferencia del soft-stop, aquí es corrección).
      const seVan = hermanas.filter(h => !diasNuevos.has(h.Dia_Semana)).map(h => h.ID_Recurrencia);
      if (seVan.length) {
        await tx.actividad_Recurrencias.deleteMany({ where: { ID_Recurrencia: { in: seVan } } });
      }
      // Días nuevos: crear fila hermana.
      const seAgregan = [...diasNuevos].filter(d => !diasActuales.has(d));
      if (seAgregan.length) {
        await tx.actividad_Recurrencias.createMany({
          data: seAgregan.map(dia => ({
            ID_Empleado: regla.ID_Empleado,
            ID_Grupo: regla.ID_Grupo,
            // Las filas hermanas heredan el responsable de la regla original.
            ID_Responsable: regla.ID_Responsable,
            Dia_Semana: dia,
            CreatedBy: req.user.Email_Office365,
            ...datosComunes
          }))
        });
      }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'Actividad_Recurrencias',
      idRegistro: id.toString(),
      descripcion: `Recurrencia actualizada: ${datosComunes.Nombre_Actividad} (empleado ${regla.ID_Empleado}, días ${dias.map(d => NOMBRES_DIA[d]).join('/')})`,
      datosPrevios: { Nombre_Actividad: regla.Nombre_Actividad, dias: [...diasActuales] },
      datosNuevos: { ...datosComunes, dias },
      ip: obtenerIP(req)
    });

    // Si la fila abierta se eliminó (su día se desmarcó), volver al calendario.
    const sigueViva = await prisma.actividad_Recurrencias.findUnique({ where: { ID_Recurrencia: id } });
    req.flash('success', 'Recurrencia actualizada');
    res.redirect(sigueViva ? volver : '/encargado');
  } catch (error) {
    next(error);
  }
};

// POST /encargado/recurrencias/:id/detener - Soft-stop de toda la regla:
// corta la vigencia a ayer y la desactiva, sin borrar el histórico.
export const detenerRecurrencia = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const regla = await prisma.actividad_Recurrencias.findUnique({ where: { ID_Recurrencia: id } });
    if (!regla) {
      req.flash('error', 'Recurrencia no encontrada');
      return res.redirect('/encargado');
    }

    const supervisor = esSupervisor(req.user);
    const miId = req.user.ID_Empleado;
    const permitido = supervisor ||
      (miId ? await empleadoEnEquipoDeEncargado(regla.ID_Empleado, miId, new Date()) : false);
    if (!permitido) {
      return res.status(403).render('errors/403', { title: 'Acceso Denegado', message: 'Esa recurrencia no pertenece a tu equipo' });
    }

    const hermanas = await filasDeLaRegla(regla);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const corte = new Date(hoy.getTime() - 24 * 3600 * 1000); // ayer

    for (const h of hermanas) {
      await prisma.actividad_Recurrencias.update({
        where: { ID_Recurrencia: h.ID_Recurrencia },
        data: { Fecha_Fin: corte < h.Fecha_Inicio ? h.Fecha_Inicio : corte, Activo: false }
      });
    }

    await registrarCambio({
      usuario: req.user,
      accion: 'DELETE',
      tabla: 'Actividad_Recurrencias',
      idRegistro: id.toString(),
      descripcion: `Recurrencia detenida: ${regla.Nombre_Actividad} (${hermanas.length} día(s) de la semana)`,
      ip: obtenerIP(req)
    });

    req.flash('success', 'Recurrencia detenida — deja de aplicar desde hoy');
    res.redirect('/encargado');
  } catch (error) {
    next(error);
  }
};

export default {
  index,
  crear,
  store,
  ver,
  actualizar,
  eliminar,
  guardarDias,
  agregarAsignacion,
  quitarAsignacion,
  quitarAsignacionesLote,
  toggleCelda,
  actualizarDatosJson,
  guardarHorasDia,
  guardarHorasDiaJson,
  verRecurrencia,
  actualizarRecurrencia,
  detenerRecurrencia
};
