import prisma from '../config/database.js';

// ============================================================
// CONTROLADOR DE PUESTOS
// ============================================================

// GET /puestos - Listar todos los puestos
export const index = async (req, res, next) => {
  try {
    const { area } = req.query;

    const where = {};
    if (area) {
      where.ID_Area = parseInt(area);
    }

    const [puestos, areas] = await Promise.all([
      prisma.cat_Puestos.findMany({
        where,
        include: {
          area: true,
          _count: {
            select: { empleados: true }
          }
        },
        orderBy: { Nombre_Puesto: 'asc' }
      }),
      prisma.cat_Areas.findMany({ orderBy: { Nombre_Area: 'asc' } })
    ]);

    res.render('puestos/index', {
      title: 'Puestos',
      puestos,
      areas,
      filtros: { area }
    });
  } catch (error) {
    next(error);
  }
};

// GET /puestos/crear - Mostrar formulario de creación
export const crear = async (req, res, next) => {
  try {
    const areas = await prisma.cat_Areas.findMany({
      orderBy: { Nombre_Area: 'asc' }
    });

    res.render('puestos/crear', {
      title: 'Nuevo Puesto',
      areas
    });
  } catch (error) {
    next(error);
  }
};

// POST /puestos - Guardar nuevo puesto
export const store = async (req, res, next) => {
  try {
    const {
      Nombre_Puesto,
      ID_Area,
      Descripcion,
      Salario_Base_Referencia,
      Salario_Hora_Referencia
    } = req.body;

    await prisma.cat_Puestos.create({
      data: {
        Nombre_Puesto,
        ID_Area: parseInt(ID_Area),
        Descripcion: Descripcion || null,
        Salario_Base_Referencia: Salario_Base_Referencia ? parseFloat(Salario_Base_Referencia) : null,
        Salario_Hora_Referencia: Salario_Hora_Referencia ? parseFloat(Salario_Hora_Referencia) : null
      }
    });

    res.redirect('/puestos');
  } catch (error) {
    next(error);
  }
};

// GET /puestos/:id/editar - Mostrar formulario de edición
export const editar = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [puesto, areas] = await Promise.all([
      prisma.cat_Puestos.findUnique({
        where: { ID_Puesto: parseInt(id) },
        include: { area: true }
      }),
      prisma.cat_Areas.findMany({ orderBy: { Nombre_Area: 'asc' } })
    ]);

    if (!puesto) {
      return res.status(404).render('errors/404', {
        title: 'Puesto no encontrado',
        message: 'El puesto solicitado no existe'
      });
    }

    res.render('puestos/editar', {
      title: `Editar: ${puesto.Nombre_Puesto}`,
      puesto,
      areas
    });
  } catch (error) {
    next(error);
  }
};

// PUT /puestos/:id - Actualizar puesto
export const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      Nombre_Puesto,
      ID_Area,
      Descripcion,
      Salario_Base_Referencia,
      Salario_Hora_Referencia
    } = req.body;

    await prisma.cat_Puestos.update({
      where: { ID_Puesto: parseInt(id) },
      data: {
        Nombre_Puesto,
        ID_Area: parseInt(ID_Area),
        Descripcion: Descripcion || null,
        Salario_Base_Referencia: Salario_Base_Referencia ? parseFloat(Salario_Base_Referencia) : null,
        Salario_Hora_Referencia: Salario_Hora_Referencia ? parseFloat(Salario_Hora_Referencia) : null
      }
    });

    res.redirect('/puestos');
  } catch (error) {
    next(error);
  }
};

// DELETE /puestos/:id - Eliminar puesto
export const destroy = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verificar si tiene empleados asociados
    const empleadosCount = await prisma.empleados.count({
      where: { ID_Puesto: parseInt(id) }
    });

    if (empleadosCount > 0) {
      return res.status(400).render('errors/error', {
        title: 'No se puede eliminar',
        message: `Este puesto tiene ${empleadosCount} empleado(s) asociado(s). Primero reasígnelos a otro puesto.`
      });
    }

    await prisma.cat_Puestos.delete({
      where: { ID_Puesto: parseInt(id) }
    });

    res.redirect('/puestos');
  } catch (error) {
    next(error);
  }
};

// API: Obtener puestos por área (para AJAX)
export const getPuestosByArea = async (req, res, next) => {
  try {
    const { areaId } = req.params;

    const puestos = await prisma.cat_Puestos.findMany({
      where: { ID_Area: parseInt(areaId) },
      orderBy: { Nombre_Puesto: 'asc' }
    });

    res.json(puestos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener puestos' });
  }
};

export default {
  index,
  crear,
  store,
  editar,
  update,
  destroy,
  getPuestosByArea
};
