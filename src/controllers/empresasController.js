import prisma from '../config/database.js';
import { registrarCambio, obtenerIP } from '../middleware/audit.js';
import { logAccess } from '../config/logger.js';

// ============================================================
// CONTROLADOR DE EMPRESAS (clientes externos para actividades de campo)
// ============================================================

// GET /empresas - Listar todas las empresas
export const index = async (req, res, next) => {
  try {
    const empresas = await prisma.cat_Empresas.findMany({
      include: {
        _count: { select: { actividades: true } }
      },
      orderBy: { Nombre_Empresa: 'asc' }
    });

    res.render('empresas/index', {
      title: 'Empresas',
      empresas
    });
  } catch (error) {
    next(error);
  }
};

// GET /empresas/crear - Mostrar formulario de creación
export const crear = async (req, res) => {
  res.render('empresas/crear', {
    title: 'Nueva Empresa'
  });
};

// POST /empresas - Guardar nueva empresa
export const store = async (req, res, next) => {
  try {
    const { Nombre_Empresa, Descripcion } = req.body;

    const empresa = await prisma.cat_Empresas.create({
      data: {
        Nombre_Empresa: Nombre_Empresa.trim(),
        Descripcion: Descripcion || null
      }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'CREATE',
      tabla: 'Cat_Empresas',
      idRegistro: empresa.ID_Empresa.toString(),
      descripcion: `Creación de empresa: ${empresa.Nombre_Empresa}`,
      datosNuevos: {
        ID_Empresa: empresa.ID_Empresa,
        Nombre_Empresa: empresa.Nombre_Empresa,
        Descripcion: empresa.Descripcion
      },
      ip: obtenerIP(req)
    });

    logAccess.action(
      req.user.ID_Usuario,
      'CREATE_EMPRESA',
      'Cat_Empresas',
      { empresaId: empresa.ID_Empresa, nombre: empresa.Nombre_Empresa }
    );

    res.redirect('/empresas');
  } catch (error) {
    if (error.code === 'P2002') {
      return res.render('empresas/crear', {
        title: 'Nueva Empresa',
        error: 'Ya existe una empresa con ese nombre',
        datos: req.body
      });
    }
    next(error);
  }
};

// GET /empresas/:id/editar - Mostrar formulario de edición
export const editar = async (req, res, next) => {
  try {
    const { id } = req.params;

    const empresa = await prisma.cat_Empresas.findUnique({
      where: { ID_Empresa: parseInt(id) }
    });

    if (!empresa) {
      return res.status(404).render('errors/404', {
        title: 'Empresa no encontrada',
        message: 'La empresa solicitada no existe'
      });
    }

    res.render('empresas/editar', {
      title: `Editar: ${empresa.Nombre_Empresa}`,
      empresa
    });
  } catch (error) {
    next(error);
  }
};

// PUT /empresas/:id - Actualizar empresa
export const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { Nombre_Empresa, Descripcion, Activo } = req.body;
    const idNum = parseInt(id);

    const empresaPrevia = await prisma.cat_Empresas.findUnique({
      where: { ID_Empresa: idNum }
    });

    const empresa = await prisma.cat_Empresas.update({
      where: { ID_Empresa: idNum },
      data: {
        Nombre_Empresa: Nombre_Empresa.trim(),
        Descripcion: Descripcion || null,
        Activo: Activo === 'on' || Activo === true
      }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'Cat_Empresas',
      idRegistro: idNum.toString(),
      descripcion: `Actualización de empresa: ${empresa.Nombre_Empresa}`,
      datosPrevios: {
        Nombre_Empresa: empresaPrevia.Nombre_Empresa,
        Descripcion: empresaPrevia.Descripcion,
        Activo: empresaPrevia.Activo
      },
      datosNuevos: {
        Nombre_Empresa: empresa.Nombre_Empresa,
        Descripcion: empresa.Descripcion,
        Activo: empresa.Activo
      },
      ip: obtenerIP(req)
    });

    res.redirect('/empresas');
  } catch (error) {
    if (error.code === 'P2002') {
      return res.redirect(`/empresas/${req.params.id}/editar?error=Ya existe una empresa con ese nombre`);
    }
    next(error);
  }
};

// DELETE /empresas/:id - Eliminar empresa
export const destroy = async (req, res, next) => {
  try {
    const { id } = req.params;
    const idNum = parseInt(id);

    const actividadesCount = await prisma.actividades_Campo.count({
      where: { ID_Empresa: idNum }
    });

    if (actividadesCount > 0) {
      return res.status(400).render('errors/error', {
        title: 'No se puede eliminar',
        message: `Esta empresa tiene ${actividadesCount} actividad(es) de campo asociada(s). Desactívela en lugar de eliminarla.`
      });
    }

    const empresa = await prisma.cat_Empresas.findUnique({
      where: { ID_Empresa: idNum }
    });

    await prisma.cat_Empresas.delete({
      where: { ID_Empresa: idNum }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'DELETE',
      tabla: 'Cat_Empresas',
      idRegistro: idNum.toString(),
      descripcion: `Eliminación de empresa: ${empresa.Nombre_Empresa}`,
      datosPrevios: {
        ID_Empresa: empresa.ID_Empresa,
        Nombre_Empresa: empresa.Nombre_Empresa,
        Descripcion: empresa.Descripcion
      },
      ip: obtenerIP(req)
    });

    res.redirect('/empresas');
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
