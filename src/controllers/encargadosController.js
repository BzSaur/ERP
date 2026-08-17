import prisma from '../config/database.js';
import { registrarCambio, obtenerIP } from '../middleware/audit.js';
import { crearNotificacionParaEmpleado } from '../services/notificacionesService.js';

// ============================================================
// CONTROLADOR SUPERADMIN DE ENCARGADOS
// Cat_Encargados es un catálogo de "quién puede ser responsable de un
// Grupo" — independiente del rol de acceso (App_Usuarios.ID_Rol), que sigue
// gestionándose en /usuarios. No se muta el rol automáticamente aquí.
// ============================================================

const ROLES_CON_ACCESO = ['ENCARGADO', 'ADMIN', 'ADMINISTRADOR', 'RH', 'RECURSOS_HUMANOS', 'SUPER_ADMIN', 'SUPERADMINISTRADOR'];
const normalizeRole = (r) => (r || '').toUpperCase().replace(/\s+/g, '_');

// GET /admin/encargados - Listado
export const index = async (req, res, next) => {
  try {
    const encargados = await prisma.cat_Encargados.findMany({
      include: {
        empleado: {
          select: {
            Nombre: true, Apellido_Paterno: true, Apellido_Materno: true,
            area: { select: { Nombre_Area: true } },
            puesto: { select: { Nombre_Puesto: true } },
            app_usuario: { select: { rol: { select: { Nombre_Rol: true } } } }
          }
        },
        _count: { select: { grupos: true } }
      },
      orderBy: { empleado: { Nombre: 'asc' } }
    });

    const conAdvertencia = encargados.map(e => ({
      ...e,
      sinAcceso: !ROLES_CON_ACCESO.includes(normalizeRole(e.empleado?.app_usuario?.rol?.Nombre_Rol))
    }));

    res.render('admin/encargados/index', { title: 'Encargados', encargados: conAdvertencia });
  } catch (error) {
    next(error);
  }
};

// GET /admin/encargados/crear - Formulario (picker de empleado)
export const crear = async (req, res, next) => {
  try {
    const yaDesignados = await prisma.cat_Encargados.findMany({ select: { ID_Empleado: true } });
    const excluidos = new Set(yaDesignados.map(e => e.ID_Empleado));

    const empleados = await prisma.empleados.findMany({
      where: { ID_Estatus: 1 },
      orderBy: { Nombre: 'asc' },
      select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true }
    });

    res.render('admin/encargados/crear', {
      title: 'Designar Encargado',
      empleados: empleados.filter(e => !excluidos.has(e.ID_Empleado))
    });
  } catch (error) {
    next(error);
  }
};

// POST /admin/encargados - Designar
export const store = async (req, res, next) => {
  try {
    const idEmpleado = parseInt(req.body.ID_Empleado);
    if (!Number.isInteger(idEmpleado)) {
      req.flash('error', 'Selecciona un empleado válido');
      return res.redirect('/admin/encargados/crear');
    }

    const encargado = await prisma.cat_Encargados.create({
      data: { ID_Empleado: idEmpleado, CreatedBy: req.user.Email_Office365 }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'CREATE',
      tabla: 'Cat_Encargados',
      idRegistro: encargado.ID_Encargado_Cat.toString(),
      descripcion: `Empleado ${idEmpleado} designado como encargado`,
      datosNuevos: { ID_Empleado: idEmpleado },
      ip: obtenerIP(req)
    });

    try {
      await crearNotificacionParaEmpleado({
        idEmpleado,
        tipo: 'ENCARGADO_DESIGNADO',
        titulo: 'Fuiste designado encargado',
        mensaje: 'Ya puedes crear grupos y gestionar actividades de campo/home office para tu equipo.',
        url: '/encargado'
      });
    } catch (err) {
      // best-effort
    }

    req.flash('success', 'Encargado designado exitosamente');
    res.redirect('/admin/encargados');
  } catch (error) {
    if (error.code === 'P2002') {
      req.flash('error', 'Ese empleado ya está designado como encargado');
      return res.redirect('/admin/encargados/crear');
    }
    next(error);
  }
};

// POST /admin/encargados/:id/eliminar - Revocar (bloqueado si tiene grupos)
export const destroy = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const gruposCount = await prisma.grupos.count({ where: { ID_Encargado: id } });

    if (gruposCount > 0) {
      req.flash('error', `Este encargado tiene ${gruposCount} grupo(s) asignado(s). Reasígnalos o elimínalos primero.`);
      return res.redirect('/admin/encargados');
    }

    const encargado = await prisma.cat_Encargados.findUnique({ where: { ID_Encargado_Cat: id } });
    await prisma.cat_Encargados.delete({ where: { ID_Encargado_Cat: id } });

    await registrarCambio({
      usuario: req.user,
      accion: 'DELETE',
      tabla: 'Cat_Encargados',
      idRegistro: id.toString(),
      descripcion: `Designación de encargado revocada (empleado ${encargado?.ID_Empleado})`,
      datosPrevios: { ID_Empleado: encargado?.ID_Empleado },
      ip: obtenerIP(req)
    });

    req.flash('success', 'Designación revocada');
    res.redirect('/admin/encargados');
  } catch (error) {
    next(error);
  }
};

export default { index, crear, store, destroy };
