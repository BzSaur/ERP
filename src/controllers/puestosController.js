import prisma from '../config/database.js';
import { registrarCambio, obtenerIP } from '../middleware/audit.js';
import { logAccess } from '../config/logger.js';

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

    const puesto = await prisma.cat_Puestos.create({
      data: {
        Nombre_Puesto,
        ID_Area: parseInt(ID_Area),
        Descripcion: Descripcion || null,
        Salario_Base_Referencia: Salario_Base_Referencia ? parseFloat(Salario_Base_Referencia) : null,
        Salario_Hora_Referencia: Salario_Hora_Referencia ? parseFloat(Salario_Hora_Referencia) : null
      }
    });

    // Registrar en auditoría con énfasis en salarios
    await registrarCambio({
      usuario: req.user,
      accion: 'CREATE',
      tabla: 'Cat_Puestos',
      idRegistro: puesto.ID_Puesto.toString(),
      descripcion: `Creación de puesto: ${puesto.Nombre_Puesto} - Salario Base: $${puesto.Salario_Base_Referencia || 0}, Salario Hora: $${puesto.Salario_Hora_Referencia || 0}`,
      datosNuevos: {
        ID_Puesto: puesto.ID_Puesto,
        Nombre_Puesto: puesto.Nombre_Puesto,
        ID_Area: puesto.ID_Area,
        Descripcion: puesto.Descripcion,
        Salario_Base_Referencia: puesto.Salario_Base_Referencia,
        Salario_Hora_Referencia: puesto.Salario_Hora_Referencia
      },
      ip: obtenerIP(req)
    });

    // Log de acción - creación de puesto
    logAccess.action(
      req.user.ID_Usuario,
      'CREATE_POSITION',
      'Cat_Puestos',
      {
        puestoId: puesto.ID_Puesto,
        nombre: puesto.Nombre_Puesto,
        salarioBase: puesto.Salario_Base_Referencia
      }
    );

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
    const idNum = parseInt(id);

    // Obtener datos previos para comparar salarios
    const puestoPrevio = await prisma.cat_Puestos.findUnique({
      where: { ID_Puesto: idNum }
    });

    const nuevoSalarioBase = Salario_Base_Referencia ? parseFloat(Salario_Base_Referencia) : null;
    const nuevoSalarioHora = Salario_Hora_Referencia ? parseFloat(Salario_Hora_Referencia) : null;
    let cascadeMensaje = '';

    const puesto = await prisma.cat_Puestos.update({
      where: { ID_Puesto: idNum },
      data: {
        Nombre_Puesto,
        ID_Area: parseInt(ID_Area),
        Descripcion: Descripcion || null,
        Salario_Base_Referencia: nuevoSalarioBase,
        Salario_Hora_Referencia: nuevoSalarioHora
      }
    });

    // Propagar cambio de salario a todos los empleados activos con este puesto
    if (nuevoSalarioBase) {
      const salarioPrevio = Number(puestoPrevio.Salario_Base_Referencia) || 0;
      
      // Siempre actualizar empleados que tengan salario incorrecto respecto al puesto
      const salarioDiarioNuevo = Math.round((nuevoSalarioBase / 30) * 100) / 100;
      const salarioHoraNuevo = Math.round((salarioDiarioNuevo / 8) * 100) / 100;
      
      const actualizados = await prisma.empleados.updateMany({
        where: {
          ID_Puesto: idNum,
          ID_Estatus: 1 // Solo activos
        },
        data: {
          Salario_Mensual: nuevoSalarioBase,
          Salario_Diario: salarioDiarioNuevo,
          Salario_Hora: salarioHoraNuevo
        }
      });
      
      if (actualizados.count > 0) {
        cascadeMensaje = ` | Salario actualizado para ${actualizados.count} empleado(s) activo(s)`;
      }
    }

    // Descripción con cambios de salario resaltados
    let descripcion = `Actualización de puesto: ${puesto.Nombre_Puesto}`;
    if (puestoPrevio.Salario_Base_Referencia !== puesto.Salario_Base_Referencia) {
      descripcion += ` - Salario Base: $${puestoPrevio.Salario_Base_Referencia || 0} → $${puesto.Salario_Base_Referencia || 0}`;
    }
    if (puestoPrevio.Salario_Hora_Referencia !== puesto.Salario_Hora_Referencia) {
      descripcion += ` - Salario Hora: $${puestoPrevio.Salario_Hora_Referencia || 0} → $${puesto.Salario_Hora_Referencia || 0}`;
    }
    descripcion += cascadeMensaje;

    // Registrar en auditoría
    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'Cat_Puestos',
      idRegistro: idNum.toString(),
      descripcion,
      datosPrevios: {
        Nombre_Puesto: puestoPrevio.Nombre_Puesto,
        ID_Area: puestoPrevio.ID_Area,
        Descripcion: puestoPrevio.Descripcion,
        Salario_Base_Referencia: puestoPrevio.Salario_Base_Referencia,
        Salario_Hora_Referencia: puestoPrevio.Salario_Hora_Referencia
      },
      datosNuevos: {
        Nombre_Puesto: puesto.Nombre_Puesto,
        ID_Area: puesto.ID_Area,
        Descripcion: puesto.Descripcion,
        Salario_Base_Referencia: puesto.Salario_Base_Referencia,
        Salario_Hora_Referencia: puesto.Salario_Hora_Referencia
      },
      ip: obtenerIP(req)
    });

    // Log de acción - actualización de puesto (importante para cambios de salario)
    logAccess.action(
      req.user.ID_Usuario,
      'UPDATE_POSITION',
      'Cat_Puestos',
      {
        puestoId: idNum,
        nombre: puesto.Nombre_Puesto,
        salarioAnterior: puestoPrevio.Salario_Base_Referencia,
        salarioNuevo: puesto.Salario_Base_Referencia,
        cambioDeSalario: puestoPrevio.Salario_Base_Referencia !== puesto.Salario_Base_Referencia
      }
    );

    res.redirect('/puestos');
  } catch (error) {
    next(error);
  }
};

// DELETE /puestos/:id - Eliminar puesto
export const destroy = async (req, res, next) => {
  try {
    const { id } = req.params;
    const idNum = parseInt(id);

    // Verificar si tiene empleados asociados
    const empleadosCount = await prisma.empleados.count({
      where: { ID_Puesto: idNum }
    });

    if (empleadosCount > 0) {
      return res.status(400).render('errors/error', {
        title: 'No se puede eliminar',
        message: `Este puesto tiene ${empleadosCount} empleado(s) asociado(s). Primero reasígnelos a otro puesto.`
      });
    }

    // Obtener datos antes de eliminar
    const puesto = await prisma.cat_Puestos.findUnique({
      where: { ID_Puesto: idNum }
    });

    await prisma.cat_Puestos.delete({
      where: { ID_Puesto: idNum }
    });

    // Registrar en auditoría
    await registrarCambio({
      usuario: req.user,
      accion: 'DELETE',
      tabla: 'Cat_Puestos',
      idRegistro: idNum.toString(),
      descripcion: `Eliminación de puesto: ${puesto.Nombre_Puesto} - Salario Base: $${puesto.Salario_Base_Referencia || 0}`,
      datosPrevios: {
        ID_Puesto: puesto.ID_Puesto,
        Nombre_Puesto: puesto.Nombre_Puesto,
        ID_Area: puesto.ID_Area,
        Descripcion: puesto.Descripcion,
        Salario_Base_Referencia: puesto.Salario_Base_Referencia,
        Salario_Hora_Referencia: puesto.Salario_Hora_Referencia
      },
      ip: obtenerIP(req)
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
