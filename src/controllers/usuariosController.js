import prisma from '../config/database.js';
import bcrypt from 'bcryptjs';
import { registrarCambio, obtenerIP } from '../middleware/audit.js';
import { logAccess } from '../config/logger.js';

// ============================================================
// CONTROLADOR DE USUARIOS DEL SISTEMA
// ============================================================

// GET /usuarios - Listar todos los usuarios
export const index = async (req, res) => {
  try {
    const usuarios = await prisma.app_Usuarios.findMany({
      include: {
        rol: true,
        empleado: {
          select: {
            ID_Empleado: true,
            Nombre: true,
            Apellido_Paterno: true,
            Apellido_Materno: true
          }
        }
      },
      orderBy: { CreatedAt: 'desc' }
    });

    const roles = await prisma.cat_Roles.findMany({
      orderBy: { Nombre_Rol: 'asc' }
    });

    res.render('usuarios/index', {
      title: 'Usuarios del Sistema',
      usuarios,
      roles,
      error: req.query.error
    });
  } catch (error) {
    console.error('Error al listar usuarios:', error);
    res.status(500).render('errors/500', { error });
  }
};

// GET /usuarios/crear - Formulario para crear usuario
export const crear = async (req, res) => {
  try {
    const roles = await prisma.cat_Roles.findMany({
      orderBy: { Nombre_Rol: 'asc' }
    });

    // Empleados que no tienen usuario asignado
    const empleadosSinUsuario = await prisma.empleados.findMany({
      where: {
        app_usuario: null,
        ID_Estatus: 1 // Solo activos
      },
      orderBy: { Nombre: 'asc' }
    });

    res.render('usuarios/crear', {
      title: 'Nuevo Usuario',
      roles,
      empleados: empleadosSinUsuario
    });
  } catch (error) {
    console.error('Error al cargar formulario:', error);
    res.status(500).render('errors/500', { error });
  }
};

// POST /usuarios - Crear nuevo usuario
export const store = async (req, res) => {
  try {
    const {
      Email_Office365,
      Nombre_Completo,
      Password,
      ID_Rol,
      ID_Empleado,
      Activo
    } = req.body;

    // Verificar si el email ya existe
    const existeEmail = await prisma.app_Usuarios.findUnique({
      where: { Email_Office365 }
    });

    if (existeEmail) {
      const roles = await prisma.cat_Roles.findMany({ orderBy: { Nombre_Rol: 'asc' } });
      const empleados = await prisma.empleados.findMany({
        where: { app_usuario: null, ID_Estatus: 1 },
        orderBy: { Nombre: 'asc' }
      });

      return res.render('usuarios/crear', {
        title: 'Nuevo Usuario',
        roles,
        empleados,
        error: 'El correo electrónico ya está registrado',
        datos: req.body
      });
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(Password, 12);

    // Crear usuario
    const usuario = await prisma.app_Usuarios.create({
      data: {
        Email_Office365,
        Nombre_Completo,
        Password: hashedPassword,
        ID_Rol: parseInt(ID_Rol),
        ID_Empleado: ID_Empleado ? parseInt(ID_Empleado) : null,
        Activo: Activo === 'on' || Activo === true
      },
      include: { rol: true }
    });

    // Registrar en auditoría
    await registrarCambio({
      usuario: req.user,
      accion: 'CREATE',
      tabla: 'App_Usuarios',
      idRegistro: usuario.ID_Usuario.toString(),
      descripcion: `Creación de usuario: ${usuario.Email_Office365} con rol ${usuario.rol.Nombre_Rol}`,
      datosNuevos: {
        ID_Usuario: usuario.ID_Usuario,
        Email_Office365: usuario.Email_Office365,
        Nombre_Completo: usuario.Nombre_Completo,
        ID_Rol: usuario.ID_Rol,
        Rol: usuario.rol.Nombre_Rol,
        ID_Empleado: usuario.ID_Empleado,
        Activo: usuario.Activo
      },
      ip: obtenerIP(req)
    });

    // Log de acción - creación de usuario
    logAccess.action(
      req.user.ID_Usuario,
      'CREATE_USER',
      'App_Usuarios',
      {
        usuarioId: usuario.ID_Usuario,
        email: usuario.Email_Office365,
        rol: usuario.rol.Nombre_Rol
      }
    );

    res.redirect('/usuarios?created=1');
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.redirect('/usuarios?error=Error al crear el usuario');
  }
};

// GET /usuarios/:id/editar - Formulario para editar usuario
export const editar = async (req, res) => {
  try {
    const { id } = req.params;

    const usuario = await prisma.app_Usuarios.findUnique({
      where: { ID_Usuario: parseInt(id) },
      include: { rol: true, empleado: true }
    });

    if (!usuario) {
      return res.redirect('/usuarios?error=Usuario no encontrado');
    }

    const roles = await prisma.cat_Roles.findMany({
      orderBy: { Nombre_Rol: 'asc' }
    });

    // Empleados disponibles (sin usuario asignado o el actual)
    const empleados = await prisma.empleados.findMany({
      where: {
        ID_Estatus: 1,
        OR: [
          { app_usuario: null },
          { app_usuario: { ID_Usuario: usuario.ID_Usuario } }
        ]
      },
      orderBy: { Nombre: 'asc' },
      select: {
        ID_Empleado: true,
        Nombre: true,
        Apellido_Paterno: true,
        Apellido_Materno: true
      }
    });

    res.render('usuarios/editar', {
      title: 'Editar Usuario',
      usuario,
      roles,
      empleados
    });
  } catch (error) {
    console.error('Error al cargar usuario:', error);
    res.status(500).render('errors/500', { error });
  }
};

// POST /usuarios/:id - Actualizar usuario
export const update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      Email_Office365,
      Nombre_Completo,
      Password,
      ID_Rol,
      ID_Empleado,
      Activo
    } = req.body;

    // Verificar si el email ya existe en otro usuario
    const existeEmail = await prisma.app_Usuarios.findFirst({
      where: {
        Email_Office365,
        NOT: { ID_Usuario: parseInt(id) }
      }
    });

    if (existeEmail) {
      return res.redirect(`/usuarios/${id}/editar?error=El correo ya está en uso`);
    }

    // Preparar datos de actualización
    const updateData = {
      Email_Office365,
      Nombre_Completo,
      ID_Rol: parseInt(ID_Rol),
      ID_Empleado: ID_Empleado ? parseInt(ID_Empleado) : null,
      Activo: Activo === 'on' || Activo === true
    };

    // Solo actualizar contraseña si se proporciona una nueva
    if (Password && Password.trim() !== '') {
      updateData.Password = await bcrypt.hash(Password, 12);
    }

    // Obtener datos previos
    const usuarioPrevio = await prisma.app_Usuarios.findUnique({
      where: { ID_Usuario: parseInt(id) },
      include: { rol: true }
    });

    const usuario = await prisma.app_Usuarios.update({
      where: { ID_Usuario: parseInt(id) },
      data: updateData,
      include: { rol: true }
    });

    // Descripción con cambios de rol resaltados
    let descripcion = `Actualización de usuario: ${usuario.Email_Office365}`;
    if (usuarioPrevio.ID_Rol !== usuario.ID_Rol) {
      descripcion += ` - Rol cambiado: ${usuarioPrevio.rol.Nombre_Rol} → ${usuario.rol.Nombre_Rol}`;
    }
    if (Password && Password.trim() !== '') {
      descripcion += ' - Contraseña actualizada';
    }

    // Registrar en auditoría
    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'App_Usuarios',
      idRegistro: id,
      descripcion,
      datosPrevios: {
        Email_Office365: usuarioPrevio.Email_Office365,
        Nombre_Completo: usuarioPrevio.Nombre_Completo,
        ID_Rol: usuarioPrevio.ID_Rol,
        Rol: usuarioPrevio.rol.Nombre_Rol,
        ID_Empleado: usuarioPrevio.ID_Empleado,
        Activo: usuarioPrevio.Activo
      },
      datosNuevos: {
        Email_Office365: usuario.Email_Office365,
        Nombre_Completo: usuario.Nombre_Completo,
        ID_Rol: usuario.ID_Rol,
        Rol: usuario.rol.Nombre_Rol,
        ID_Empleado: usuario.ID_Empleado,
        Activo: usuario.Activo,
        PasswordCambiado: !!(Password && Password.trim() !== '')
      },
      ip: obtenerIP(req)
    });

    // Log de acción - actualización de usuario
    logAccess.action(
      req.user.ID_Usuario,
      'UPDATE_USER',
      'App_Usuarios',
      {
        usuarioId: id,
        email: usuario.Email_Office365,
        rolAnterior: usuarioPrevio.rol.Nombre_Rol,
        rolNuevo: usuario.rol.Nombre_Rol,
        cambioDeRol: usuarioPrevio.ID_Rol !== usuario.ID_Rol
      }
    );

    res.redirect('/usuarios?updated=1');
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.redirect('/usuarios?error=Error al actualizar el usuario');
  }
};

// POST /usuarios/:id/eliminar - Eliminar usuario
export const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    const idNum = parseInt(id);

    // No permitir eliminar al usuario actual
    if (req.user.ID_Usuario === idNum) {
      return res.redirect('/usuarios?error=No puedes eliminar tu propia cuenta');
    }

    // Verificar que el usuario existe
    const usuario = await prisma.app_Usuarios.findUnique({
      where: { ID_Usuario: idNum },
      include: { rol: true }
    });

    if (!usuario) {
      return res.redirect('/usuarios?error=Usuario no encontrado');
    }

    await prisma.app_Usuarios.delete({
      where: { ID_Usuario: idNum }
    });

    // Registrar en auditoría
    await registrarCambio({
      usuario: req.user,
      accion: 'DELETE',
      tabla: 'App_Usuarios',
      idRegistro: idNum.toString(),
      descripcion: `Eliminación de usuario: ${usuario.Email_Office365} (${usuario.rol.Nombre_Rol})`,
      datosPrevios: {
        ID_Usuario: usuario.ID_Usuario,
        Email_Office365: usuario.Email_Office365,
        Nombre_Completo: usuario.Nombre_Completo,
        ID_Rol: usuario.ID_Rol,
        Rol: usuario.rol.Nombre_Rol,
        ID_Empleado: usuario.ID_Empleado,
        Activo: usuario.Activo
      },
      ip: obtenerIP(req)
    });

    // Log de acción - eliminación de usuario
    logAccess.action(
      req.user.ID_Usuario,
      'DELETE_USER',
      'App_Usuarios',
      {
        usuarioId: idNum,
        email: usuario.Email_Office365,
        rol: usuario.rol.Nombre_Rol
      }
    );

    res.redirect('/usuarios?deleted=1');
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.redirect('/usuarios?error=Error al eliminar el usuario');
  }
};

// POST /usuarios/:id/toggle-activo - Activar/Desactivar usuario
export const toggleActivo = async (req, res) => {
  try {
    const { id } = req.params;
    const idNum = parseInt(id);

    // No permitir desactivar al usuario actual
    if (req.user.ID_Usuario === idNum) {
      return res.redirect('/usuarios?error=No puedes desactivar tu propia cuenta');
    }

    const usuario = await prisma.app_Usuarios.findUnique({
      where: { ID_Usuario: idNum },
      include: { rol: true }
    });

    if (!usuario) {
      return res.redirect('/usuarios?error=Usuario no encontrado');
    }

    const nuevoEstado = !usuario.Activo;

    await prisma.app_Usuarios.update({
      where: { ID_Usuario: idNum },
      data: { Activo: nuevoEstado }
    });

    // Registrar en auditoría
    const estado = usuario.Activo ? 'desactivado' : 'activado';
    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'App_Usuarios',
      idRegistro: idNum.toString(),
      descripcion: `Usuario ${estado}: ${usuario.Email_Office365}`,
      datosPrevios: { Activo: usuario.Activo },
      datosNuevos: { Activo: nuevoEstado },
      ip: obtenerIP(req)
    });

    res.redirect('/usuarios?updated=1');
  } catch (error) {
    console.error('Error al cambiar estado:', error);
    res.redirect('/usuarios?error=Error al cambiar estado del usuario');
  }
};

export default {
  index,
  crear,
  store,
  editar,
  update,
  eliminar,
  toggleActivo
};