import bcrypt from 'bcryptjs';
import prisma from '../config/database.js';
import { registrarCambio, obtenerIP } from '../middleware/audit.js';
import { crearNotificacionParaEmpleado } from '../services/notificacionesService.js';
import { obtenerEmpleadosDisponiblesParaGrupo } from '../services/gruposService.js';

// ============================================================
// CONTROLADOR SUPERADMIN DE GRUPOS
// Un grupo tiene UN encargado responsable y N miembros, cada uno con su
// propia vigencia (Fecha_Inicio/Fecha_Fin) independiente del resto.
// ============================================================

// GET /admin/grupos - Listado
export const index = async (req, res, next) => {
  try {
    const grupos = await prisma.grupos.findMany({
      include: {
        encargado: { include: { empleado: { select: { Nombre: true, Apellido_Paterno: true, Apellido_Materno: true } } } },
        _count: { select: { miembros: true } }
      },
      orderBy: { Nombre_Grupo: 'asc' }
    });
    res.render('admin/grupos/index', { title: 'Grupos', grupos });
  } catch (error) {
    next(error);
  }
};

// GET /admin/grupos/wizard - Pantalla única: encargado (existente o nuevo,
// con su cuenta de acceso si le falta) + datos del grupo + miembros
// iniciales, todo en un solo POST.
export const wizard = async (req, res, next) => {
  try {
    const [encargados, empleados] = await Promise.all([
      prisma.cat_Encargados.findMany({
        where: { Activo: true },
        include: { empleado: { select: { Nombre: true, Apellido_Paterno: true, Apellido_Materno: true } } },
        orderBy: { empleado: { Nombre: 'asc' } }
      }),
      prisma.empleados.findMany({
        where: { ID_Estatus: 1 },
        orderBy: { Nombre: 'asc' },
        select: {
          ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true,
          area: { select: { Nombre_Area: true } },
          puesto: { select: { Nombre_Puesto: true } },
          app_usuario: { select: { Email_Office365: true, rol: { select: { Nombre_Rol: true } } } }
        }
      })
    ]);
    res.render('admin/grupos/wizard', { title: 'Alta rápida de grupo', encargados, empleados });
  } catch (error) {
    next(error);
  }
};

// POST /admin/grupos/wizard - Crea (si hace falta) el encargado + su cuenta
// de acceso, el grupo y sus miembros iniciales, en una sola operación.
// Nunca falla a medias.
export const wizardStore = async (req, res, next) => {
  try {
    const { Nombre_Grupo, Descripcion, ID_Encargado, Nuevo_Encargado_Empleado, Nueva_Cuenta_Email, Nueva_Cuenta_Password } = req.body;
    const miembrosIds = (req.body.miembros == null ? [] : Array.isArray(req.body.miembros) ? req.body.miembros : [req.body.miembros])
      .map(Number).filter(Number.isInteger);
    const fechaInicioDefault = req.body.Fecha_Inicio ? new Date(req.body.Fecha_Inicio) : new Date();

    if (!Nombre_Grupo || !Nombre_Grupo.trim()) {
      req.flash('error', 'El nombre del grupo es obligatorio');
      return res.redirect('/admin/grupos/wizard');
    }
    if (!ID_Encargado && !Nuevo_Encargado_Empleado) {
      req.flash('error', 'Selecciona un encargado existente o un empleado para designar como nuevo encargado');
      return res.redirect('/admin/grupos/wizard');
    }

    // Si se va a crear cuenta de acceso nueva, validar antes de entrar a la
    // transacción (evita rollback tardío por un error de validación simple).
    let hashNuevaCuenta = null;
    if (!ID_Encargado && Nueva_Cuenta_Email) {
      if (!Nueva_Cuenta_Password || Nueva_Cuenta_Password.length < 8) {
        req.flash('error', 'La contraseña de la nueva cuenta debe tener al menos 8 caracteres');
        return res.redirect('/admin/grupos/wizard');
      }
      const emailExistente = await prisma.app_Usuarios.findUnique({ where: { Email_Office365: Nueva_Cuenta_Email } });
      if (emailExistente) {
        req.flash('error', 'Ese correo ya está en uso por otra cuenta');
        return res.redirect('/admin/grupos/wizard');
      }
      hashNuevaCuenta = await bcrypt.hash(Nueva_Cuenta_Password, 12);
    }

    let idEncargadoCat;
    let empleadoEncargadoId = null; // para notificar si es designación nueva
    let esNuevoEncargado = false;
    let cuentaCreada = false;
    let rolElevado = false;

    const resultado = await prisma.$transaction(async (tx) => {
      if (ID_Encargado) {
        idEncargadoCat = parseInt(ID_Encargado);
      } else {
        const idEmpNuevo = parseInt(Nuevo_Encargado_Empleado);

        // Cuenta de acceso: crear si no tiene, o subir su rol a ENCARGADO si
        // ya tiene cuenta con otro rol (nunca degrada SUPER_ADMIN/ADMIN/RH).
        const rolEncargado = await tx.cat_Roles.findUnique({ where: { Nombre_Rol: 'ENCARGADO' } });
        const usuarioExistente = await tx.app_Usuarios.findUnique({ where: { ID_Empleado: idEmpNuevo }, include: { rol: true } });
        const ROLES_SUPERIORES = ['SUPER_ADMIN', 'ADMIN', 'RH'];
        if (!usuarioExistente && hashNuevaCuenta) {
          const empleado = await tx.empleados.findUnique({ where: { ID_Empleado: idEmpNuevo }, select: { Nombre: true, Apellido_Paterno: true, Apellido_Materno: true } });
          await tx.app_Usuarios.create({
            data: {
              Email_Office365: Nueva_Cuenta_Email,
              Nombre_Completo: [empleado.Nombre, empleado.Apellido_Paterno, empleado.Apellido_Materno].filter(Boolean).join(' '),
              Password: hashNuevaCuenta,
              ID_Rol: rolEncargado.ID_Rol,
              ID_Empleado: idEmpNuevo,
              Activo: true
            }
          });
          cuentaCreada = true;
        } else if (usuarioExistente && !ROLES_SUPERIORES.includes(usuarioExistente.rol.Nombre_Rol.toUpperCase()) && usuarioExistente.rol.Nombre_Rol !== 'ENCARGADO') {
          await tx.app_Usuarios.update({ where: { ID_Usuario: usuarioExistente.ID_Usuario }, data: { ID_Rol: rolEncargado.ID_Rol } });
          rolElevado = true;
        }

        // Reusar designación si ya estaba (evita choque de unique en ID_Empleado).
        const existente = await tx.cat_Encargados.findUnique({ where: { ID_Empleado: idEmpNuevo } });
        if (existente) {
          idEncargadoCat = existente.ID_Encargado_Cat;
        } else {
          const nuevo = await tx.cat_Encargados.create({ data: { ID_Empleado: idEmpNuevo, CreatedBy: req.user.Email_Office365 } });
          idEncargadoCat = nuevo.ID_Encargado_Cat;
          empleadoEncargadoId = idEmpNuevo;
          esNuevoEncargado = true;
        }
      }

      const grupo = await tx.grupos.create({
        data: {
          Nombre_Grupo: Nombre_Grupo.trim(),
          ID_Encargado: idEncargadoCat,
          Descripcion: Descripcion || null,
          CreatedBy: req.user.Email_Office365
        }
      });

      if (miembrosIds.length > 0) {
        await tx.grupo_Miembros.createMany({
          data: miembrosIds.map(idEmpleado => ({
            ID_Grupo: grupo.ID_Grupo,
            ID_Empleado: idEmpleado,
            Fecha_Inicio: fechaInicioDefault,
            CreatedBy: req.user.Email_Office365
          }))
        });
      }

      return grupo;
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'CREATE',
      tabla: 'Grupos',
      idRegistro: resultado.ID_Grupo.toString(),
      descripcion: `Grupo creado vía wizard: ${resultado.Nombre_Grupo} (${miembrosIds.length} miembro(s) iniciales${esNuevoEncargado ? ', encargado nuevo' : ''}${cuentaCreada ? ', cuenta creada' : ''}${rolElevado ? ', rol elevado a ENCARGADO' : ''})`,
      datosNuevos: { ID_Grupo: resultado.ID_Grupo, Nombre_Grupo: resultado.Nombre_Grupo, ID_Encargado: idEncargadoCat, miembrosIds },
      ip: obtenerIP(req)
    });

    // Notificaciones best-effort: encargado nuevo + cada miembro agregado.
    try {
      if (esNuevoEncargado && empleadoEncargadoId) {
        await crearNotificacionParaEmpleado({
          idEmpleado: empleadoEncargadoId,
          tipo: 'ENCARGADO_DESIGNADO',
          titulo: 'Fuiste designado encargado',
          mensaje: `Ya puedes gestionar el grupo "${resultado.Nombre_Grupo}".`,
          url: '/encargado'
        });
      }
      for (const idEmpleado of miembrosIds) {
        await crearNotificacionParaEmpleado({
          idEmpleado,
          tipo: 'GRUPO_MIEMBRO_CAMBIO',
          titulo: 'Agregado a un grupo',
          mensaje: `Fuiste agregado al grupo "${resultado.Nombre_Grupo}".`,
          url: '/'
        });
      }
    } catch (err) {
      // best-effort
    }

    let mensajeExtra = '';
    if (cuentaCreada) mensajeExtra = ' — cuenta de acceso creada';
    else if (rolElevado) mensajeExtra = ' — rol de la cuenta existente elevado a ENCARGADO';
    req.flash('success', `Grupo "${resultado.Nombre_Grupo}" creado con ${miembrosIds.length} miembro(s)${mensajeExtra}`);
    res.redirect(`/admin/grupos/${resultado.ID_Grupo}/editar`);
  } catch (error) {
    if (error.code === 'P2002') {
      req.flash('error', 'Conflicto al crear el grupo (dato duplicado). Intenta de nuevo.');
      return res.redirect('/admin/grupos/wizard');
    }
    next(error);
  }
};

// GET /admin/grupos/crear - Formulario de creación
export const crear = async (req, res, next) => {
  try {
    const encargados = await prisma.cat_Encargados.findMany({
      where: { Activo: true },
      include: { empleado: { select: { Nombre: true, Apellido_Paterno: true, Apellido_Materno: true } } },
      orderBy: { empleado: { Nombre: 'asc' } }
    });
    res.render('admin/grupos/crear', { title: 'Nuevo Grupo', encargados });
  } catch (error) {
    next(error);
  }
};

// POST /admin/grupos - Guardar nuevo grupo
export const store = async (req, res, next) => {
  try {
    const { Nombre_Grupo, ID_Encargado, Descripcion } = req.body;

    if (!Nombre_Grupo || !Nombre_Grupo.trim() || !ID_Encargado) {
      req.flash('error', 'Nombre del grupo y encargado son obligatorios');
      return res.redirect('/admin/grupos/crear');
    }

    const grupo = await prisma.grupos.create({
      data: {
        Nombre_Grupo: Nombre_Grupo.trim(),
        ID_Encargado: parseInt(ID_Encargado),
        Descripcion: Descripcion || null,
        CreatedBy: req.user.Email_Office365
      }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'CREATE',
      tabla: 'Grupos',
      idRegistro: grupo.ID_Grupo.toString(),
      descripcion: `Grupo creado: ${grupo.Nombre_Grupo}`,
      datosNuevos: { ID_Grupo: grupo.ID_Grupo, Nombre_Grupo: grupo.Nombre_Grupo, ID_Encargado: grupo.ID_Encargado },
      ip: obtenerIP(req)
    });

    req.flash('success', 'Grupo creado exitosamente');
    res.redirect(`/admin/grupos/${grupo.ID_Grupo}/editar`);
  } catch (error) {
    next(error);
  }
};

// GET /admin/grupos/:id/editar - Formulario de edición + panel de miembros
export const editar = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const grupo = await prisma.grupos.findUnique({
      where: { ID_Grupo: id },
      include: {
        encargado: { include: { empleado: { select: { Nombre: true, Apellido_Paterno: true, Apellido_Materno: true } } } },
        miembros: {
          include: { empleado: { select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true } } },
          orderBy: [{ Activo: 'desc' }, { Fecha_Inicio: 'desc' }]
        }
      }
    });

    if (!grupo) {
      req.flash('error', 'Grupo no encontrado');
      return res.redirect('/admin/grupos');
    }

    const idsMiembros = grupo.miembros.map(m => m.ID_Empleado);
    const [encargados, disponibles, recurrencias, tiposActividad, empresas] = await Promise.all([
      prisma.cat_Encargados.findMany({
        where: { Activo: true },
        include: { empleado: { select: { Nombre: true, Apellido_Paterno: true, Apellido_Materno: true } } },
        orderBy: { empleado: { Nombre: 'asc' } }
      }),
      obtenerEmpleadosDisponiblesParaGrupo(id),
      idsMiembros.length > 0
        ? prisma.actividad_Recurrencias.findMany({
            where: { Activo: true, ID_Empleado: { in: idsMiembros } },
            include: {
              empleado: { select: { Nombre: true, Apellido_Paterno: true } },
              empresa: { select: { Nombre_Empresa: true } },
              tipo_actividad: { select: { Nombre: true } }
            },
            orderBy: [{ ID_Empleado: 'asc' }, { Dia_Semana: 'asc' }]
          })
        : Promise.resolve([]),
      prisma.cat_Tipo_Actividad.findMany({ where: { Activo: true }, orderBy: { Nombre: 'asc' } }),
      prisma.cat_Empresas.findMany({ where: { Activo: true }, orderBy: { Nombre_Empresa: 'asc' } })
    ]);

    const NOMBRES_DIA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    // Set de claves "ID_Empleado_Dia_Semana" con recurrencia activa, para
    // pre-marcar la matriz clic-para-alternar sin recorrerla en la vista.
    const recurrenciasKeys = new Set(recurrencias.map(r => `${r.ID_Empleado}_${r.Dia_Semana}`));
    // Mismo criterio: ID de la regla por celda, para linkear al detalle
    // completo (editar días/datos, o eliminar) en /encargado/recurrencias/:id.
    const recurrenciasIds = new Map(recurrencias.map(r => [`${r.ID_Empleado}_${r.Dia_Semana}`, r.ID_Recurrencia]));

    res.render('admin/grupos/editar', {
      title: `Editar: ${grupo.Nombre_Grupo}`,
      grupo, encargados, disponibles, recurrencias, tiposActividad, empresas, recurrenciasKeys, recurrenciasIds,
      nombresDiaCorto: NOMBRES_DIA_CORTO
    });
  } catch (error) {
    next(error);
  }
};

// PUT /admin/grupos/:id - Actualizar datos del grupo
export const update = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { Nombre_Grupo, ID_Encargado, Descripcion, Activo } = req.body;

    const grupoPrevio = await prisma.grupos.findUnique({ where: { ID_Grupo: id } });
    if (!grupoPrevio) {
      req.flash('error', 'Grupo no encontrado');
      return res.redirect('/admin/grupos');
    }

    const nuevoIdEncargado = parseInt(ID_Encargado);
    const grupo = await prisma.grupos.update({
      where: { ID_Grupo: id },
      data: {
        Nombre_Grupo: Nombre_Grupo.trim(),
        ID_Encargado: nuevoIdEncargado,
        Descripcion: Descripcion || null,
        Activo: Activo === 'on' || Activo === true,
        UpdatedBy: req.user.Email_Office365
      }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'Grupos',
      idRegistro: id.toString(),
      descripcion: `Grupo actualizado: ${grupo.Nombre_Grupo}`,
      datosPrevios: { Nombre_Grupo: grupoPrevio.Nombre_Grupo, ID_Encargado: grupoPrevio.ID_Encargado, Activo: grupoPrevio.Activo },
      datosNuevos: { Nombre_Grupo: grupo.Nombre_Grupo, ID_Encargado: grupo.ID_Encargado, Activo: grupo.Activo },
      ip: obtenerIP(req)
    });

    // Reasignación de encargado: notificar al anterior y al nuevo.
    if (grupoPrevio.ID_Encargado !== nuevoIdEncargado) {
      const [encargadoAnterior, encargadoNuevo] = await Promise.all([
        prisma.cat_Encargados.findUnique({ where: { ID_Encargado_Cat: grupoPrevio.ID_Encargado }, select: { ID_Empleado: true } }),
        prisma.cat_Encargados.findUnique({ where: { ID_Encargado_Cat: nuevoIdEncargado }, select: { ID_Empleado: true } })
      ]);
      try {
        if (encargadoAnterior) {
          await crearNotificacionParaEmpleado({
            idEmpleado: encargadoAnterior.ID_Empleado,
            tipo: 'GRUPO_REASIGNADO',
            titulo: 'Grupo reasignado',
            mensaje: `El grupo "${grupo.Nombre_Grupo}" ya no está bajo tu responsabilidad.`,
            url: '/encargado'
          });
        }
        if (encargadoNuevo) {
          await crearNotificacionParaEmpleado({
            idEmpleado: encargadoNuevo.ID_Empleado,
            tipo: 'GRUPO_REASIGNADO',
            titulo: 'Nuevo grupo asignado',
            mensaje: `Ahora eres responsable del grupo "${grupo.Nombre_Grupo}".`,
            url: '/encargado'
          });
        }
      } catch (err) {
        // Notificación best-effort: nunca bloquea el flujo principal.
      }
    }

    req.flash('success', 'Grupo actualizado');
    res.redirect(`/admin/grupos/${id}/editar`);
  } catch (error) {
    next(error);
  }
};

// DELETE /admin/grupos/:id - Eliminar (bloqueado si tiene miembros)
export const destroy = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const miembrosCount = await prisma.grupo_Miembros.count({ where: { ID_Grupo: id } });

    if (miembrosCount > 0) {
      return res.status(400).render('errors/error', {
        title: 'No se puede eliminar',
        message: `Este grupo tiene ${miembrosCount} miembro(s) (incluye histórico). Desactívelo en lugar de eliminarlo.`
      });
    }

    const grupo = await prisma.grupos.findUnique({ where: { ID_Grupo: id } });
    await prisma.grupos.delete({ where: { ID_Grupo: id } });

    await registrarCambio({
      usuario: req.user,
      accion: 'DELETE',
      tabla: 'Grupos',
      idRegistro: id.toString(),
      descripcion: `Grupo eliminado: ${grupo.Nombre_Grupo}`,
      datosPrevios: { ID_Grupo: grupo.ID_Grupo, Nombre_Grupo: grupo.Nombre_Grupo },
      ip: obtenerIP(req)
    });

    req.flash('success', 'Grupo eliminado');
    res.redirect('/admin/grupos');
  } catch (error) {
    next(error);
  }
};

// ============================================================
// MIEMBROS DEL GRUPO (con vigencia individual)
// ============================================================

// Valida que [Fecha_Inicio, Fecha_Fin] no se traslape con una membresía activa
// ya existente del mismo empleado en el mismo grupo (excluyendo, si aplica,
// la propia fila que se está editando).
async function hayTraslapeMembresia(idGrupo, idEmpleado, fechaInicio, fechaFin, excluirIdMiembro = null) {
  const where = {
    ID_Grupo: idGrupo,
    ID_Empleado: idEmpleado,
    Activo: true,
    Fecha_Inicio: { lte: fechaFin ?? new Date('9999-12-31') },
    OR: [{ Fecha_Fin: null }, { Fecha_Fin: { gte: fechaInicio } }]
  };
  if (excluirIdMiembro) where.ID_Miembro = { not: excluirIdMiembro };
  const existente = await prisma.grupo_Miembros.findFirst({ where });
  return !!existente;
}

// POST /admin/grupos/:id/miembros - Agregar miembro con vigencia
export const agregarMiembro = async (req, res, next) => {
  try {
    const idGrupo = parseInt(req.params.id);
    const idEmpleado = parseInt(req.body.ID_Empleado);
    const fechaInicio = req.body.Fecha_Inicio ? new Date(req.body.Fecha_Inicio) : null;
    const fechaFin = req.body.Fecha_Fin ? new Date(req.body.Fecha_Fin) : null;

    if (!Number.isInteger(idEmpleado) || !fechaInicio) {
      req.flash('error', 'Selecciona un empleado y una fecha de inicio válidos');
      return res.redirect(`/admin/grupos/${idGrupo}/editar`);
    }
    if (fechaFin && fechaFin < fechaInicio) {
      req.flash('error', 'La fecha de fin no puede ser anterior a la de inicio');
      return res.redirect(`/admin/grupos/${idGrupo}/editar`);
    }

    if (await hayTraslapeMembresia(idGrupo, idEmpleado, fechaInicio, fechaFin)) {
      req.flash('error', 'Ese empleado ya tiene una membresía vigente en este grupo que se traslapa con esas fechas');
      return res.redirect(`/admin/grupos/${idGrupo}/editar`);
    }

    await prisma.grupo_Miembros.create({
      data: {
        ID_Grupo: idGrupo,
        ID_Empleado: idEmpleado,
        Fecha_Inicio: fechaInicio,
        Fecha_Fin: fechaFin,
        CreatedBy: req.user.Email_Office365
      }
    });

    try {
      const grupo = await prisma.grupos.findUnique({ where: { ID_Grupo: idGrupo }, select: { Nombre_Grupo: true } });
      await crearNotificacionParaEmpleado({
        idEmpleado,
        tipo: 'GRUPO_MIEMBRO_CAMBIO',
        titulo: 'Agregado a un grupo',
        mensaje: `Fuiste agregado al grupo "${grupo?.Nombre_Grupo}".`,
        url: '/'
      });
    } catch (err) {
      // best-effort
    }

    req.flash('success', 'Miembro agregado al grupo');
    res.redirect(`/admin/grupos/${idGrupo}/editar`);
  } catch (error) {
    next(error);
  }
};

// PUT /admin/grupos/:id/miembros/:idMiembro - Editar vigencia/estado de un miembro
export const editarMiembro = async (req, res, next) => {
  try {
    const idGrupo = parseInt(req.params.id);
    const idMiembro = parseInt(req.params.idMiembro);
    const fechaInicio = req.body.Fecha_Inicio ? new Date(req.body.Fecha_Inicio) : null;
    const fechaFin = req.body.Fecha_Fin ? new Date(req.body.Fecha_Fin) : null;
    const activo = req.body.Activo === 'on' || req.body.Activo === true;

    const miembro = await prisma.grupo_Miembros.findUnique({ where: { ID_Miembro: idMiembro } });
    if (!miembro || miembro.ID_Grupo !== idGrupo) {
      req.flash('error', 'Membresía no encontrada');
      return res.redirect(`/admin/grupos/${idGrupo}/editar`);
    }
    if (!fechaInicio) {
      req.flash('error', 'Fecha de inicio requerida');
      return res.redirect(`/admin/grupos/${idGrupo}/editar`);
    }
    if (fechaFin && fechaFin < fechaInicio) {
      req.flash('error', 'La fecha de fin no puede ser anterior a la de inicio');
      return res.redirect(`/admin/grupos/${idGrupo}/editar`);
    }

    if (activo && await hayTraslapeMembresia(idGrupo, miembro.ID_Empleado, fechaInicio, fechaFin, idMiembro)) {
      req.flash('error', 'Esas fechas se traslapan con otra membresía vigente del mismo empleado en este grupo');
      return res.redirect(`/admin/grupos/${idGrupo}/editar`);
    }

    await prisma.grupo_Miembros.update({
      where: { ID_Miembro: idMiembro },
      data: { Fecha_Inicio: fechaInicio, Fecha_Fin: fechaFin, Activo: activo }
    });

    req.flash('success', 'Membresía actualizada');
    res.redirect(`/admin/grupos/${idGrupo}/editar`);
  } catch (error) {
    next(error);
  }
};

// POST /admin/grupos/:id/miembros/:idMiembro/eliminar - Baja de miembro (soft)
export const quitarMiembro = async (req, res, next) => {
  try {
    const idGrupo = parseInt(req.params.id);
    const idMiembro = parseInt(req.params.idMiembro);

    const miembro = await prisma.grupo_Miembros.findUnique({ where: { ID_Miembro: idMiembro } });
    if (miembro && miembro.ID_Grupo === idGrupo) {
      await prisma.grupo_Miembros.update({ where: { ID_Miembro: idMiembro }, data: { Activo: false } });

      try {
        const grupo = await prisma.grupos.findUnique({ where: { ID_Grupo: idGrupo }, select: { Nombre_Grupo: true } });
        await crearNotificacionParaEmpleado({
          idEmpleado: miembro.ID_Empleado,
          tipo: 'GRUPO_MIEMBRO_CAMBIO',
          titulo: 'Removido de un grupo',
          mensaje: `Fuiste removido del grupo "${grupo?.Nombre_Grupo}".`,
          url: '/'
        });
      } catch (err) {
        // best-effort
      }
    }

    req.flash('success', 'Miembro removido del grupo');
    res.redirect(`/admin/grupos/${idGrupo}/editar`);
  } catch (error) {
    next(error);
  }
};

// ============================================================
// CALENDARIO EDITABLE DE RECURRENCIAS (clic en celda = alterna)
// ============================================================

// Mismo criterio de traslape que actividadesController.
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

const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// POST /admin/grupos/:id/recurrencias/toggle - Prende/apaga la recurrencia de
// un empleado en un día de la semana. Si no existe regla activa, la crea con
// los valores por defecto recibidos; si existe, la detiene (soft-stop, igual
// nunca borra histórico).
export const toggleRecurrencia = async (req, res, next) => {
  try {
    const idGrupo = parseInt(req.params.id);
    const idEmpleado = parseInt(req.body.ID_Empleado);
    const diaSemana = parseInt(req.body.Dia_Semana);

    if (!Number.isInteger(idEmpleado) || !Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
      return res.status(400).json({ ok: false, error: 'Empleado o día de la semana inválido' });
    }

    const grupo = await prisma.grupos.findUnique({ where: { ID_Grupo: idGrupo } });
    if (!grupo) return res.status(404).json({ ok: false, error: 'Grupo no encontrado' });

    // Sin filtro de ID_Grupo: la matriz de la vista (ver `editar`) marca la
    // celda activa buscando solo por empleado+día, sin importar bajo qué
    // grupo se creó la regla — el toggle debe encontrar la misma fila o el
    // botón nunca se apaga y pide de nuevo nombre/tipo/empresa.
    const existente = await prisma.actividad_Recurrencias.findFirst({
      where: { ID_Empleado: idEmpleado, Dia_Semana: diaSemana, Activo: true }
    });

    if (existente) {
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const corte = new Date(hoy.getTime() - 24 * 3600 * 1000);
      await prisma.actividad_Recurrencias.update({
        where: { ID_Recurrencia: existente.ID_Recurrencia },
        data: { Fecha_Fin: corte < existente.Fecha_Inicio ? existente.Fecha_Inicio : corte, Activo: false }
      });

      await registrarCambio({
        usuario: req.user,
        accion: 'DELETE',
        tabla: 'Actividad_Recurrencias',
        idRegistro: existente.ID_Recurrencia.toString(),
        descripcion: `Recurrencia detenida vía calendario: empleado ${idEmpleado}, ${NOMBRES_DIA[diaSemana]}`,
        ip: obtenerIP(req)
      });

      return res.json({ ok: true, activo: false });
    }

    const idTipoActividad = parseInt(req.body.ID_Tipo_Actividad);
    const idEmpresa = parseInt(req.body.ID_Empresa);
    const nombreActividad = (req.body.Nombre_Actividad || '').trim();

    if (!Number.isInteger(idTipoActividad) || !Number.isInteger(idEmpresa) || !nombreActividad) {
      return res.status(400).json({ ok: false, error: 'Completa nombre, tipo y empresa por defecto antes de activar celdas' });
    }
    const tipoValido = await prisma.cat_Tipo_Actividad.findUnique({ where: { ID_Tipo_Actividad: idTipoActividad } });
    if (!tipoValido || !tipoValido.Activo) {
      return res.status(400).json({ ok: false, error: 'El tipo de actividad seleccionado ya no está disponible' });
    }

    const manana = new Date(); manana.setDate(manana.getDate() + 1); manana.setHours(0, 0, 0, 0);
    if (await hayTraslapeRecurrencia(idEmpleado, diaSemana, manana, null)) {
      return res.status(400).json({ ok: false, error: `Ya existe una recurrencia activa los ${NOMBRES_DIA[diaSemana]} para ese empleado` });
    }

    // El responsable de la regla es el encargado del grupo donde se define.
    const encargadoGrupo = await prisma.grupos.findUnique({
      where: { ID_Grupo: idGrupo },
      select: { encargado: { select: { ID_Empleado: true } } }
    });

    const nueva = await prisma.actividad_Recurrencias.create({
      data: {
        ID_Empleado: idEmpleado,
        ID_Grupo: idGrupo,
        ID_Responsable: encargadoGrupo?.encargado?.ID_Empleado ?? null,
        ID_Tipo_Actividad: idTipoActividad,
        Nombre_Actividad: nombreActividad,
        ID_Empresa: idEmpresa,
        Dia_Semana: diaSemana,
        Fecha_Inicio: manana,
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

    res.json({ ok: true, activo: true });
  } catch (error) {
    next(error);
  }
};

export default {
  index, crear, store, editar, update, destroy,
  agregarMiembro, editarMiembro, quitarMiembro,
  wizard, wizardStore, toggleRecurrencia
};
