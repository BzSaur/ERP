/**
 * Controlador de Configuración del Sistema (SuperAdmin)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Panel de configuración
export const index = async (req, res) => {
  try {
    // Obtener estadísticas generales
    const stats = {
      totalEmpleados: await prisma.empleados.count(),
      totalUsuarios: await prisma.app_Usuarios.count(),
      totalAreas: await prisma.cat_Areas.count(),
      totalPuestos: await prisma.cat_Puestos.count(),
      totalNacionalidades: await prisma.cat_Nacionalidades.count(),
      totalHorarios: await prisma.cat_Tipo_Horario.count(),
      totalRoles: await prisma.cat_Roles.count(),
      totalEstatus: await prisma.cat_Estatus_Empleado.count()
    };
    
    // Obtener los roles del sistema
    const roles = await prisma.cat_Roles.findMany({
      orderBy: { ID_Rol: 'asc' }
    });
    
    // Obtener estatus de empleados
    const estatusEmpleado = await prisma.cat_Estatus_Empleado.findMany({
      orderBy: { ID_Estatus: 'asc' }
    });
    
    res.render('configuracion/index', {
      title: 'Configuración del Sistema',
      stats,
      roles,
      estatusEmpleado
    });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al cargar la configuración');
    res.redirect('/');
  }
};

// Gestión de Roles
export const roles = async (req, res) => {
  try {
    const roles = await prisma.cat_Roles.findMany({
      include: {
        _count: {
          select: { app_usuarios: true }
        }
      },
      orderBy: { ID_Rol: 'asc' }
    });
    
    res.render('configuracion/roles', {
      title: 'Gestión de Roles',
      roles
    });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al cargar los roles');
    res.redirect('/configuracion');
  }
};

// Crear rol
export const crearRol = async (req, res) => {
  try {
    const { Nombre_Rol, Descripcion } = req.body;
    
    await prisma.cat_Roles.create({
      data: {
        Nombre_Rol,
        Descripcion: Descripcion || null
      }
    });
    
    req.flash('success', 'Rol creado exitosamente');
    res.redirect('/configuracion/roles');
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al crear el rol');
    res.redirect('/configuracion/roles');
  }
};

// Actualizar rol
export const actualizarRol = async (req, res) => {
  try {
    const { id } = req.params;
    const { Nombre_Rol, Descripcion } = req.body;
    
    await prisma.cat_Roles.update({
      where: { ID_Rol: parseInt(id) },
      data: {
        Nombre_Rol,
        Descripcion: Descripcion || null
      }
    });
    
    req.flash('success', 'Rol actualizado');
    res.redirect('/configuracion/roles');
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al actualizar el rol');
    res.redirect('/configuracion/roles');
  }
};

// Gestión de Estatus
export const estatus = async (req, res) => {
  try {
    const estatusList = await prisma.cat_Estatus_Empleado.findMany({
      include: {
        _count: {
          select: { empleados: true }
        }
      },
      orderBy: { ID_Estatus: 'asc' }
    });
    
    res.render('configuracion/estatus', {
      title: 'Estatus de Empleados',
      estatusList
    });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al cargar los estatus');
    res.redirect('/configuracion');
  }
};

// Crear estatus
export const crearEstatus = async (req, res) => {
  try {
    const { Nombre_Estatus, Descripcion } = req.body;
    
    await prisma.cat_Estatus_Empleado.create({
      data: {
        Nombre_Estatus,
        Descripcion: Descripcion || null
      }
    });
    
    req.flash('success', 'Estatus creado exitosamente');
    res.redirect('/configuracion/estatus');
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al crear el estatus');
    res.redirect('/configuracion/estatus');
  }
};

// Actualizar estatus
export const actualizarEstatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { Nombre_Estatus, Descripcion } = req.body;
    
    await prisma.cat_Estatus_Empleado.update({
      where: { ID_Estatus: parseInt(id) },
      data: {
        Nombre_Estatus,
        Descripcion: Descripcion || null
      }
    });
    
    req.flash('success', 'Estatus actualizado');
    res.redirect('/configuracion/estatus');
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al actualizar el estatus');
    res.redirect('/configuracion/estatus');
  }
};
