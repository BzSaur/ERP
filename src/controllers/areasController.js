import prisma from '../config/database.js';

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

    await prisma.cat_Areas.create({
      data: {
        Nombre_Area: Nombre_Area.toUpperCase(),
        Descripcion: Descripcion || null,
        Tipo_Area: Tipo_Area || null
      }
    });

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

    await prisma.cat_Areas.update({
      where: { ID_Area: parseInt(id) },
      data: {
        Nombre_Area: Nombre_Area.toUpperCase(),
        Descripcion: Descripcion || null,
        Tipo_Area: Tipo_Area || null
      }
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

    // Verificar si tiene empleados asociados
    const empleadosCount = await prisma.empleados.count({
      where: { ID_Area: parseInt(id) }
    });

    if (empleadosCount > 0) {
      return res.status(400).render('errors/error', {
        title: 'No se puede eliminar',
        message: `Esta área tiene ${empleadosCount} empleado(s) asociado(s). Primero reasígnelos a otra área.`
      });
    }

    await prisma.cat_Areas.delete({
      where: { ID_Area: parseInt(id) }
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
