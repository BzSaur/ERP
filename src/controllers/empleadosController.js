import prisma from '../config/database.js';
import { registrarCambio, obtenerIP } from '../middleware/audit.js';
import { logAccess } from '../config/logger.js';

// ============================================================
// CONTROLADOR DE EMPLEADOS
// ============================================================

// GET /empleados - Listar todos los empleados
export const index = async (req, res, next) => {
  try {
    const { buscar, area, estatus, page = 1 } = req.query;
    const perPage = 10;
    const skip = (page - 1) * perPage;

    // Construir filtros
    const where = {};
    
    if (buscar) {
      where.OR = [
        { Nombre: { contains: buscar, mode: 'insensitive' } },
        { Apellido_Paterno: { contains: buscar, mode: 'insensitive' } },
        { Apellido_Materno: { contains: buscar, mode: 'insensitive' } },
        { Documento_Identidad: { contains: buscar, mode: 'insensitive' } },
        { RFC: { contains: buscar, mode: 'insensitive' } }
      ];
    }

    if (area) {
      where.ID_Area = parseInt(area);
    }

    if (estatus) {
      where.ID_Estatus = parseInt(estatus);
    }

    // Obtener empleados con relaciones
    const [empleados, total] = await Promise.all([
      prisma.empleados.findMany({
        where,
        include: {
          area: true,
          puesto: true,
          estatus: true,
          tipo_horario: true,
          nacionalidad: true
        },
        orderBy: { CreatedAt: 'desc' },
        skip,
        take: perPage
      }),
      prisma.empleados.count({ where })
    ]);

    // Obtener catálogos para filtros
    const [areas, estatuses] = await Promise.all([
      prisma.cat_Areas.findMany({ orderBy: { Nombre_Area: 'asc' } }),
      prisma.cat_Estatus_Empleado.findMany({ orderBy: { Nombre_Estatus: 'asc' } })
    ]);

    const totalPages = Math.ceil(total / perPage);

    res.render('empleados/index', {
      title: 'Empleados',
      empleados,
      areas,
      estatuses,
      filtros: { buscar, area, estatus },
      pagination: {
        page: parseInt(page),
        totalPages,
        total
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /empleados/crear - Mostrar formulario de creación
export const crear = async (req, res, next) => {
  try {
    const [areas, puestos, tiposHorario, nacionalidades, estatuses] = await Promise.all([
      prisma.cat_Areas.findMany({ orderBy: { Nombre_Area: 'asc' } }),
      prisma.cat_Puestos.findMany({ include: { area: true }, orderBy: { Nombre_Puesto: 'asc' } }),
      prisma.cat_Tipo_Horario.findMany({ orderBy: { Nombre_Horario: 'asc' } }),
      prisma.cat_Nacionalidades.findMany({ orderBy: { Nombre_Nacionalidad: 'asc' } }),
      prisma.cat_Estatus_Empleado.findMany({ orderBy: { Nombre_Estatus: 'asc' } })
    ]);

    res.render('empleados/crear', {
      title: 'Nuevo Empleado',
      areas,
      puestos,
      tiposHorario,
      nacionalidades,
      estatuses
    });
  } catch (error) {
    next(error);
  }
};

// POST /empleados - Guardar nuevo empleado
export const store = async (req, res, next) => {
  try {
    const {
      Nombre,
      Apellido_Paterno,
      Apellido_Materno,
      Fecha_Nacimiento,
      ID_Nacionalidad,
      Documento_Identidad,
      Tipo_Documento,
      RFC,
      NSS,
      // Contacto
      Email_Personal,
      Email_Corporativo,
      Telefono_Celular,
      Telefono_Emergencia,
      Nombre_Emergencia,
      Parentesco_Emergencia,
      // Dirección
      Calle,
      Numero_Exterior,
      Numero_Interior,
      Colonia,
      Ciudad,
      Entidad_Federativa,
      Codigo_Postal,
      // Laboral
      ID_Puesto,
      ID_Area,
      ID_Tipo_Horario,
      Salario_Mensual,
      Salario_Diario,
      Salario_Hora,
      Horas_Semanales_Contratadas,
      ID_Estatus,
      Fecha_Ingreso
    } = req.body;

    // Calcular salarios si se proporciona el mensual
    let salarioMensual = Salario_Mensual ? parseFloat(Salario_Mensual) : null;
    let salarioDiario = Salario_Diario ? parseFloat(Salario_Diario) : null;
    let salarioHora = Salario_Hora ? parseFloat(Salario_Hora) : null;

    // Si no hay salario mensual, intentar obtenerlo del puesto
    if (!salarioMensual && ID_Puesto) {
      const puesto = await prisma.cat_Puestos.findUnique({
        where: { ID_Puesto: parseInt(ID_Puesto) },
        select: { Salario_Base_Referencia: true, Salario_Hora_Referencia: true }
      });
      
      if (puesto?.Salario_Base_Referencia) {
        salarioMensual = parseFloat(puesto.Salario_Base_Referencia);
        salarioDiario = salarioMensual / 30;
        salarioHora = salarioDiario / 8;
      }
    }

    // Si hay mensual pero no diario/hora, calcularlos
    if (salarioMensual && !salarioDiario) {
      salarioDiario = salarioMensual / 30;
    }
    if (salarioDiario && !salarioHora) {
      salarioHora = salarioDiario / 8;
    }

    const empleado = await prisma.empleados.create({
      data: {
        Nombre,
        Apellido_Paterno,
        Apellido_Materno: Apellido_Materno || null,
        Fecha_Nacimiento: Fecha_Nacimiento ? new Date(Fecha_Nacimiento) : null,
        ID_Nacionalidad: parseInt(ID_Nacionalidad),
        Documento_Identidad,
        Tipo_Documento,
        RFC: RFC || null,
        NSS: NSS || null,
        // Contacto
        Email_Personal: Email_Personal || null,
        Email_Corporativo: Email_Corporativo || null,
        Telefono_Celular: Telefono_Celular || null,
        Telefono_Emergencia: Telefono_Emergencia || null,
        Nombre_Emergencia: Nombre_Emergencia || null,
        Parentesco_Emergencia: Parentesco_Emergencia || null,
        // Dirección
        Calle: Calle || null,
        Numero_Exterior: Numero_Exterior || null,
        Numero_Interior: Numero_Interior || null,
        Colonia: Colonia || null,
        Ciudad: Ciudad || null,
        Entidad_Federativa: Entidad_Federativa || null,
        Codigo_Postal: Codigo_Postal || null,
        // Laboral
        ID_Puesto: parseInt(ID_Puesto),
        ID_Area: parseInt(ID_Area),
        ID_Tipo_Horario: parseInt(ID_Tipo_Horario),
        Salario_Mensual: salarioMensual,
        Salario_Diario: salarioDiario,
        Salario_Hora: salarioHora,
        Horas_Semanales_Contratadas: Horas_Semanales_Contratadas ? parseInt(Horas_Semanales_Contratadas) : 48,
        ID_Estatus: parseInt(ID_Estatus) || 1,
        Fecha_Ingreso: new Date(Fecha_Ingreso),
        CreatedBy: req.user?.Email_Office365 || 'Sistema'
      }
    });

    // Registrar en auditoría
    await registrarCambio({
      usuario: req.user,
      accion: 'CREATE',
      tabla: 'Empleados',
      idRegistro: empleado.ID_Empleado,
      descripcion: `Creación de empleado: ${Nombre} ${Apellido_Paterno} ${Apellido_Materno || ''}`,
      datosNuevos: {
        ID_Empleado: empleado.ID_Empleado,
        Nombre_Completo: `${Nombre} ${Apellido_Paterno} ${Apellido_Materno || ''}`,
        RFC,
        NSS,
        Puesto: ID_Puesto,
        Area: ID_Area,
        Salario_Mensual: salarioMensual,
        Fecha_Ingreso
      },
      ip: obtenerIP(req)
    });

    // Log de acción
    logAccess.action(
      req.user.ID_Usuario,
      'CREATE_EMPLOYEE',
      'Empleados',
      {
        empleadoId: empleado.ID_Empleado,
        nombre: `${Nombre} ${Apellido_Paterno}`,
        puesto: ID_Puesto,
        area: ID_Area
      }
    );

    req.flash('success', `Empleado ${Nombre} ${Apellido_Paterno} registrado correctamente`);
    res.redirect(`/empleados/${empleado.ID_Empleado}`);
  } catch (error) {
    next(error);
  }
};

// GET /empleados/:id - Ver detalle de empleado
export const show = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Validar ID numérico
    const idNum = parseInt(id);
    if (isNaN(idNum)) {
      return res.status(404).render('errors/404', {
        title: 'Empleado no encontrado',
        message: 'ID de empleado inválido'
      });
    }

    const empleado = await prisma.empleados.findUnique({
      where: { ID_Empleado: idNum },
      include: {
        area: true,
        puesto: true,
        estatus: true,
        tipo_horario: true,
        nacionalidad: true
      }
    });

    if (!empleado) {
      return res.status(404).render('errors/404', {
        title: 'Empleado no encontrado',
        message: 'El empleado solicitado no existe'
      });
    }

    res.render('empleados/ver', {
      title: `${empleado.Nombre} ${empleado.Apellido_Paterno}`,
      empleado
    });
  } catch (error) {
    next(error);
  }
};

// GET /empleados/:id/editar - Mostrar formulario de edición
export const editar = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Validar ID numérico
    const idNum = parseInt(id);
    if (isNaN(idNum)) {
      return res.status(404).render('errors/404', {
        title: 'Empleado no encontrado',
        message: 'ID de empleado inválido'
      });
    }

    const [empleado, areas, puestos, tiposHorario, nacionalidades, estatuses] = await Promise.all([
      prisma.empleados.findUnique({
        where: { ID_Empleado: idNum }
      }),
      prisma.cat_Areas.findMany({ orderBy: { Nombre_Area: 'asc' } }),
      prisma.cat_Puestos.findMany({ include: { area: true }, orderBy: { Nombre_Puesto: 'asc' } }),
      prisma.cat_Tipo_Horario.findMany({ orderBy: { Nombre_Horario: 'asc' } }),
      prisma.cat_Nacionalidades.findMany({ orderBy: { Nombre_Nacionalidad: 'asc' } }),
      prisma.cat_Estatus_Empleado.findMany({ orderBy: { Nombre_Estatus: 'asc' } })
    ]);

    if (!empleado) {
      return res.status(404).render('errors/404', {
        title: 'Empleado no encontrado',
        message: 'El empleado solicitado no existe'
      });
    }

    res.render('empleados/editar', {
      title: `Editar: ${empleado.Nombre} ${empleado.Apellido_Paterno}`,
      empleado,
      areas,
      puestos,
      tiposHorario,
      nacionalidades,
      estatuses
    });
  } catch (error) {
    next(error);
  }
};

// PUT /empleados/:id - Actualizar empleado
export const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Validar ID numérico
    const idNum = parseInt(id);
    if (isNaN(idNum)) {
      return res.status(404).render('errors/404', {
        title: 'Empleado no encontrado',
        message: 'ID de empleado inválido'
      });
    }
    
    const {
      Nombre,
      Apellido_Paterno,
      Apellido_Materno,
      Fecha_Nacimiento,
      ID_Nacionalidad,
      Documento_Identidad,
      Tipo_Documento,
      RFC,
      NSS,
      // Contacto
      Email_Personal,
      Email_Corporativo,
      Telefono_Celular,
      Telefono_Emergencia,
      Nombre_Emergencia,
      Parentesco_Emergencia,
      // Dirección
      Calle,
      Numero_Exterior,
      Numero_Interior,
      Colonia,
      Ciudad,
      Entidad_Federativa,
      Codigo_Postal,
      // Laboral
      ID_Puesto,
      ID_Area,
      ID_Tipo_Horario,
      Salario_Mensual,
      Salario_Diario,
      Salario_Hora,
      Horas_Semanales_Contratadas,
      ID_Estatus,
      Fecha_Ingreso,
      Fecha_Baja
    } = req.body;

    // Obtener datos previos para auditoría
    const empleadoPrevio = await prisma.empleados.findUnique({
      where: { ID_Empleado: idNum },
      select: {
        Nombre: true,
        Apellido_Paterno: true,
        Apellido_Materno: true,
        RFC: true,
        NSS: true,
        ID_Puesto: true,
        ID_Area: true,
        Salario_Diario: true,
        ID_Estatus: true
      }
    });

    await prisma.empleados.update({
      where: { ID_Empleado: idNum },
      data: {
        Nombre,
        Apellido_Paterno,
        Apellido_Materno: Apellido_Materno || null,
        Fecha_Nacimiento: Fecha_Nacimiento ? new Date(Fecha_Nacimiento) : null,
        ID_Nacionalidad: parseInt(ID_Nacionalidad),
        Documento_Identidad,
        Tipo_Documento,
        RFC: RFC || null,
        NSS: NSS || null,
        // Contacto
        Email_Personal: Email_Personal || null,
        Email_Corporativo: Email_Corporativo || null,
        Telefono_Celular: Telefono_Celular || null,
        Telefono_Emergencia: Telefono_Emergencia || null,
        Nombre_Emergencia: Nombre_Emergencia || null,
        Parentesco_Emergencia: Parentesco_Emergencia || null,
        // Dirección
        Calle: Calle || null,
        Numero_Exterior: Numero_Exterior || null,
        Numero_Interior: Numero_Interior || null,
        Colonia: Colonia || null,
        Ciudad: Ciudad || null,
        Entidad_Federativa: Entidad_Federativa || null,
        Codigo_Postal: Codigo_Postal || null,
        // Laboral
        ID_Puesto: parseInt(ID_Puesto),
        ID_Area: parseInt(ID_Area),
        ID_Tipo_Horario: parseInt(ID_Tipo_Horario),
        // Salarios: siempre recalcular diario y hora desde el mensual
        Salario_Mensual: Salario_Mensual ? parseFloat(Salario_Mensual) : (Salario_Diario ? parseFloat(Salario_Diario) * 30 : null),
        Salario_Diario: Salario_Mensual 
          ? Math.round((parseFloat(Salario_Mensual) / 30) * 100) / 100 
          : (Salario_Diario ? parseFloat(Salario_Diario) : null),
        Salario_Hora: Salario_Mensual 
          ? Math.round((parseFloat(Salario_Mensual) / 30 / 8) * 100) / 100 
          : (Salario_Hora ? parseFloat(Salario_Hora) : null),
        Horas_Semanales_Contratadas: Horas_Semanales_Contratadas ? parseInt(Horas_Semanales_Contratadas) : null,
        ID_Estatus: parseInt(ID_Estatus),
        Fecha_Ingreso: new Date(Fecha_Ingreso),
        Fecha_Baja: Fecha_Baja ? new Date(Fecha_Baja) : null,
        UpdatedBy: req.user?.Email_Office365 || 'Sistema'
      }
    });

    // Registrar en auditoría
    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'Empleados',
      idRegistro: idNum,
      descripcion: `Actualización de empleado: ${Nombre} ${Apellido_Paterno}`,
      datosPrevios: empleadoPrevio,
      datosNuevos: {
        Nombre,
        Apellido_Paterno,
        Apellido_Materno,
        RFC,
        NSS,
        ID_Puesto: parseInt(ID_Puesto),
        ID_Area: parseInt(ID_Area),
        Salario_Diario: Salario_Diario ? parseFloat(Salario_Diario) : null,
        ID_Estatus: parseInt(ID_Estatus)
      },
      ip: obtenerIP(req)
    });

    // Log de acción
    logAccess.action(
      req.user.ID_Usuario,
      'UPDATE_EMPLOYEE',
      'Empleados',
      {
        empleadoId: idNum,
        nombre: `${Nombre} ${Apellido_Paterno}`,
        cambios: Object.keys(req.body).length
      }
    );

    res.redirect(`/empleados/${id}`);
  } catch (error) {
    next(error);
  }
};

// DELETE /empleados/:id - Eliminar empleado
export const destroy = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Validar ID numérico
    const idNum = parseInt(id);
    if (isNaN(idNum)) {
      return res.status(404).render('errors/404', {
        title: 'Empleado no encontrado',
        message: 'ID de empleado inválido'
      });
    }

    // Obtener datos del empleado antes de eliminar
    const empleado = await prisma.empleados.findUnique({
      where: { ID_Empleado: idNum },
      select: {
        Nombre: true,
        Apellido_Paterno: true,
        Apellido_Materno: true,
        RFC: true,
        NSS: true,
        ID_Puesto: true,
        ID_Area: true
      }
    });

    if (!empleado) {
      req.flash('error', 'Empleado no encontrado');
      return res.redirect('/empleados');
    }

    await prisma.empleados.delete({
      where: { ID_Empleado: idNum }
    });

    // Registrar en auditoría
    await registrarCambio({
      usuario: req.user,
      accion: 'DELETE',
      tabla: 'Empleados',
      idRegistro: idNum,
      descripcion: `Eliminación de empleado: ${empleado.Nombre} ${empleado.Apellido_Paterno}`,
      datosPrevios: empleado,
      ip: obtenerIP(req)
    });

    // Log de acción
    logAccess.action(
      req.user.ID_Usuario,
      'DELETE_EMPLOYEE',
      'Empleados',
      {
        empleadoId: idNum,
        nombre: `${empleado.Nombre} ${empleado.Apellido_Paterno}`
      }
    );

    req.flash('success', 'Empleado eliminado correctamente');
    res.redirect('/empleados');
  } catch (error) {
    next(error);
  }
};

export default {
  index,
  crear,
  store,
  show,
  editar,
  update,
  destroy
};
