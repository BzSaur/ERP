import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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
      success: req.query.success,
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
    await prisma.app_Usuarios.create({
      data: {
        Email_Office365,
        Nombre_Completo,
        Password: hashedPassword,
        ID_Rol: parseInt(ID_Rol),
        ID_Empleado: ID_Empleado ? parseInt(ID_Empleado) : null,
        Activo: Activo === 'on' || Activo === true
      }
    });

    res.redirect('/usuarios?success=Usuario creado exitosamente');
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

    // Empleados disponibles (sin usuario o el actual)
    const empleados = await prisma.empleados.findMany({
      where: {
        OR: [
          { app_usuario: null },
          { ID_Empleado: usuario.ID_Empleado }
        ],
        ID_Estatus: 1
      },
      orderBy: { Nombre: 'asc' }
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

    await prisma.app_Usuarios.update({
      where: { ID_Usuario: parseInt(id) },
      data: updateData
    });

    res.redirect('/usuarios?success=Usuario actualizado exitosamente');
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.redirect('/usuarios?error=Error al actualizar el usuario');
  }
};

// POST /usuarios/:id/eliminar - Eliminar usuario
export const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    // No permitir eliminar al usuario actual
    if (req.user.ID_Usuario === parseInt(id)) {
      return res.redirect('/usuarios?error=No puedes eliminar tu propia cuenta');
    }

    // Verificar que el usuario existe
    const usuario = await prisma.app_Usuarios.findUnique({
      where: { ID_Usuario: parseInt(id) }
    });

    if (!usuario) {
      return res.redirect('/usuarios?error=Usuario no encontrado');
    }

    await prisma.app_Usuarios.delete({
      where: { ID_Usuario: parseInt(id) }
    });

    res.redirect('/usuarios?success=Usuario eliminado exitosamente');
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.redirect('/usuarios?error=Error al eliminar el usuario');
  }
};

// POST /usuarios/:id/toggle-activo - Activar/Desactivar usuario
export const toggleActivo = async (req, res) => {
  try {
    const { id } = req.params;

    // No permitir desactivar al usuario actual
    if (req.user.ID_Usuario === parseInt(id)) {
      return res.redirect('/usuarios?error=No puedes desactivar tu propia cuenta');
    }

    const usuario = await prisma.app_Usuarios.findUnique({
      where: { ID_Usuario: parseInt(id) }
    });

    if (!usuario) {
      return res.redirect('/usuarios?error=Usuario no encontrado');
    }

    await prisma.app_Usuarios.update({
      where: { ID_Usuario: parseInt(id) },
      data: { Activo: !usuario.Activo }
    });

    const estado = usuario.Activo ? 'desactivado' : 'activado';
    res.redirect(`/usuarios?success=Usuario ${estado} exitosamente`);
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
