import prisma from '../config/database.js';
import { registrarCambio, obtenerIP } from '../middleware/audit.js';

// ============================================================
// CONTROLADOR DE TIPOS DE ACTIVIDAD (catálogo abierto)
// Campo, Home Office, Venta, Capacitación, etc. Solo clasifica/trazabilidad
// — no afecta cálculo de horas (siempre 9h fijas) ni apariencia (un solo
// estilo de badge para cualquier tipo).
// ============================================================

// GET /admin/tipos-actividad - Listar todos los tipos
export const index = async (req, res, next) => {
  try {
    const tipos = await prisma.cat_Tipo_Actividad.findMany({
      include: {
        _count: { select: { actividades: true, recurrencias: true } }
      },
      orderBy: { Nombre: 'asc' }
    });

    res.render('admin/tipos-actividad/index', {
      title: 'Tipos de Actividad',
      tipos
    });
  } catch (error) {
    next(error);
  }
};

// GET /admin/tipos-actividad/crear - Mostrar formulario de creación
export const crear = async (req, res) => {
  res.render('admin/tipos-actividad/crear', {
    title: 'Nuevo Tipo de Actividad'
  });
};

// POST /admin/tipos-actividad - Guardar nuevo tipo
// Color válido = hex #rrggbb. Si viene vacío/mal formado, se usa el morado base.
const COLOR_DEFAULT = '#6f42c1';
const normalizarColor = (v) => (/^#[0-9a-fA-F]{6}$/.test((v || '').trim()) ? v.trim().toLowerCase() : COLOR_DEFAULT);

export const store = async (req, res, next) => {
  try {
    const { Nombre } = req.body;

    if (!Nombre || !Nombre.trim()) {
      return res.render('admin/tipos-actividad/crear', {
        title: 'Nuevo Tipo de Actividad',
        error: 'El nombre es obligatorio',
        datos: req.body
      });
    }

    const tipo = await prisma.cat_Tipo_Actividad.create({
      data: {
        Nombre: Nombre.trim(),
        Color: normalizarColor(req.body.Color),
        CreatedBy: req.user.Email_Office365
      }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'CREATE',
      tabla: 'Cat_Tipo_Actividad',
      idRegistro: tipo.ID_Tipo_Actividad.toString(),
      descripcion: `Tipo de actividad creado: ${tipo.Nombre}`,
      datosNuevos: { ID_Tipo_Actividad: tipo.ID_Tipo_Actividad, Nombre: tipo.Nombre },
      ip: obtenerIP(req)
    });

    req.flash('success', 'Tipo de actividad creado exitosamente');
    res.redirect('/admin/tipos-actividad');
  } catch (error) {
    if (error.code === 'P2002') {
      return res.render('admin/tipos-actividad/crear', {
        title: 'Nuevo Tipo de Actividad',
        error: 'Ya existe un tipo de actividad con ese nombre',
        datos: req.body
      });
    }
    next(error);
  }
};

// GET /admin/tipos-actividad/:id/editar - Mostrar formulario de edición
export const editar = async (req, res, next) => {
  try {
    const { id } = req.params;

    const tipo = await prisma.cat_Tipo_Actividad.findUnique({
      where: { ID_Tipo_Actividad: parseInt(id) }
    });

    if (!tipo) {
      return res.status(404).render('errors/404', {
        title: 'Tipo de actividad no encontrado',
        message: 'El tipo de actividad solicitado no existe'
      });
    }

    res.render('admin/tipos-actividad/editar', {
      title: `Editar: ${tipo.Nombre}`,
      tipo
    });
  } catch (error) {
    next(error);
  }
};

// PUT /admin/tipos-actividad/:id - Actualizar tipo
export const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { Nombre, Activo } = req.body;
    const idNum = parseInt(id);

    const tipoPrevio = await prisma.cat_Tipo_Actividad.findUnique({
      where: { ID_Tipo_Actividad: idNum }
    });

    const tipo = await prisma.cat_Tipo_Actividad.update({
      where: { ID_Tipo_Actividad: idNum },
      data: {
        Nombre: Nombre.trim(),
        Color: normalizarColor(req.body.Color),
        Activo: Activo === 'on' || Activo === true
      }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'Cat_Tipo_Actividad',
      idRegistro: idNum.toString(),
      descripcion: `Actualización de tipo de actividad: ${tipo.Nombre}`,
      datosPrevios: { Nombre: tipoPrevio.Nombre, Color: tipoPrevio.Color, Activo: tipoPrevio.Activo },
      datosNuevos: { Nombre: tipo.Nombre, Color: tipo.Color, Activo: tipo.Activo },
      ip: obtenerIP(req)
    });

    req.flash('success', 'Tipo de actividad actualizado');
    res.redirect('/admin/tipos-actividad');
  } catch (error) {
    if (error.code === 'P2002') {
      return res.redirect(`/admin/tipos-actividad/${req.params.id}/editar?error=Ya existe un tipo de actividad con ese nombre`);
    }
    next(error);
  }
};

// DELETE /admin/tipos-actividad/:id - Eliminar tipo
export const destroy = async (req, res, next) => {
  try {
    const { id } = req.params;
    const idNum = parseInt(id);

    const [actividadesCount, recurrenciasCount] = await Promise.all([
      prisma.actividades_Campo.count({ where: { ID_Tipo_Actividad: idNum } }),
      prisma.actividad_Recurrencias.count({ where: { ID_Tipo_Actividad: idNum } })
    ]);

    if (actividadesCount > 0 || recurrenciasCount > 0) {
      return res.status(400).render('errors/error', {
        title: 'No se puede eliminar',
        message: `Este tipo de actividad tiene ${actividadesCount} actividad(es) y ${recurrenciasCount} recurrencia(s) asociadas. Desactívelo en lugar de eliminarlo.`
      });
    }

    const tipo = await prisma.cat_Tipo_Actividad.findUnique({
      where: { ID_Tipo_Actividad: idNum }
    });

    await prisma.cat_Tipo_Actividad.delete({
      where: { ID_Tipo_Actividad: idNum }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'DELETE',
      tabla: 'Cat_Tipo_Actividad',
      idRegistro: idNum.toString(),
      descripcion: `Eliminación de tipo de actividad: ${tipo.Nombre}`,
      datosPrevios: { ID_Tipo_Actividad: tipo.ID_Tipo_Actividad, Nombre: tipo.Nombre },
      ip: obtenerIP(req)
    });

    req.flash('success', 'Tipo de actividad eliminado');
    res.redirect('/admin/tipos-actividad');
  } catch (error) {
    next(error);
  }
};

export default {
  index,
  crear,
  store,
  editar,
  update,
  destroy
};
