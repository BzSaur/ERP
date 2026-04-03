import prisma from '../config/database.js';
import { registrarCambio, obtenerIP } from '../middleware/audit.js';
import { logAccess } from '../config/logger.js';

// ============================================================
// CONTROLADOR DE ÁREAS
// ============================================================

// GET /areas - Listar todas las áreas
export const index = async (req, res, next) => {
  try {
    const areas = await prisma.cat_Areas.findMany({
      include: {
        _count: {
          select: { empleados: true, puestos: true }
        }
      },
      orderBy: { Nombre_Area: 'asc' }
    });

    res.render('areas/index', {
      title: 'Áreas',
      areas
    });
  } catch (error) {
    next(error);
  }
};

// GET /areas/crear - Mostrar formulario de creación
export const crear = async (req, res) => {
  res.render('areas/crear', {
    title: 'Nueva Área'
  });
};

// POST /areas - Guardar nueva área
export const store = async (req, res, next) => {
  try {
    const { Nombre_Area, Descripcion, Tipo_Area } = req.body;

    const area = await prisma.cat_Areas.create({
      data: {
        Nombre_Area: Nombre_Area.toUpperCase(),
        Descripcion: Descripcion || null,
        Tipo_Area: Tipo_Area || null
      }
    });

    // Registrar en auditoría
    await registrarCambio({
      usuario: req.user,
      accion: 'CREATE',
      tabla: 'Cat_Areas',
      idRegistro: area.ID_Area.toString(),
      descripcion: `Creación de área: ${area.Nombre_Area}`,
      datosNuevos: {
        ID_Area: area.ID_Area,
        Nombre_Area: area.Nombre_Area,
        Descripcion: area.Descripcion,
        Tipo_Area: area.Tipo_Area
      },
      ip: obtenerIP(req)
    });

    // Log de acción
    logAccess.action(
      req.user.ID_Usuario,
      'CREATE_AREA',
      'Cat_Areas',
      { areaId: area.ID_Area, nombre: area.Nombre_Area }
    );

    res.redirect('/areas');
  } catch (error) {
    next(error);
  }
};

// GET /areas/:id/editar - Mostrar formulario de edición
export const editar = async (req, res, next) => {
  try {
    const { id } = req.params;

    const area = await prisma.cat_Areas.findUnique({
      where: { ID_Area: parseInt(id) }
    });

    if (!area) {
      return res.status(404).render('errors/404', {
        title: 'Área no encontrada',
        message: 'El área solicitada no existe'
      });
    }

    res.render('areas/editar', {
      title: `Editar: ${area.Nombre_Area}`,
      area
    });
  } catch (error) {
    next(error);
  }
};

// PUT /areas/:id - Actualizar área
export const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { Nombre_Area, Descripcion, Tipo_Area } = req.body;
    const idNum = parseInt(id);

    // Obtener datos previos
    const areaPrevio = await prisma.cat_Areas.findUnique({
      where: { ID_Area: idNum }
    });

    const area = await prisma.cat_Areas.update({
      where: { ID_Area: idNum },
      data: {
        Nombre_Area: Nombre_Area.toUpperCase(),
        Descripcion: Descripcion || null,
        Tipo_Area: Tipo_Area || null
      }
    });

    // Registrar en auditoría
    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'Cat_Areas',
      idRegistro: idNum.toString(),
      descripcion: `Actualización de área: ${area.Nombre_Area}`,
      datosPrevios: {
        Nombre_Area: areaPrevio.Nombre_Area,
        Descripcion: areaPrevio.Descripcion,
        Tipo_Area: areaPrevio.Tipo_Area
      },
      datosNuevos: {
        Nombre_Area: area.Nombre_Area,
        Descripcion: area.Descripcion,
        Tipo_Area: area.Tipo_Area
      },
      ip: obtenerIP(req)
    });

    res.redirect('/areas');
  } catch (error) {
    next(error);
  }
};

// DELETE /areas/:id - Eliminar área
export const destroy = async (req, res, next) => {
  try {
    const { id } = req.params;
    const idNum = parseInt(id);

    // Verificar si tiene empleados asociados
    const empleadosCount = await prisma.empleados.count({
      where: { ID_Area: idNum }
    });

    if (empleadosCount > 0) {
      return res.status(400).render('errors/error', {
        title: 'No se puede eliminar',
        message: `Esta área tiene ${empleadosCount} empleado(s) asociado(s). Primero reasígnelos a otra área.`
      });
    }

    // Obtener datos antes de eliminar
    const area = await prisma.cat_Areas.findUnique({
      where: { ID_Area: idNum },
      include: {
        _count: {
          select: { puestos: true }
        }
      }
    });

    if (!area) {
      return res.status(404).render('errors/404', {
        title: 'Área no encontrada',
        message: 'El área solicitada no existe'
      });
    }

    // Eliminar primero los puestos relacionados y luego el área
    await prisma.$transaction(async (tx) => {
      await tx.cat_Puestos.deleteMany({
        where: { ID_Area: idNum }
      });

      await tx.cat_Areas.delete({
        where: { ID_Area: idNum }
      });
    });

    // Registrar en auditoría
    await registrarCambio({
      usuario: req.user,
      accion: 'DELETE',
      tabla: 'Cat_Areas',
      idRegistro: idNum.toString(),
      descripcion: `Eliminación de área: ${area.Nombre_Area}`,
      datosPrevios: {
        ID_Area: area.ID_Area,
        Nombre_Area: area.Nombre_Area,
        Descripcion: area.Descripcion,
        Tipo_Area: area.Tipo_Area,
        Puestos_Eliminados: area._count.puestos
      },
      ip: obtenerIP(req)
    });

    res.redirect('/areas');
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
