/**
 * Controlador de Nacionalidades
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Listar todas las nacionalidades
export const index = async (req, res) => {
  try {
    const nacionalidades = await prisma.cat_Nacionalidades.findMany({
      orderBy: { Nombre_Nacionalidad: 'asc' }
    });
    
    res.render('nacionalidades/index', {
      title: 'Nacionalidades',
      nacionalidades
    });
  } catch (error) {
    console.error('Error al obtener nacionalidades:', error);
    req.flash('error', 'Error al cargar las nacionalidades');
    res.redirect('/');
  }
};

// Formulario para crear nacionalidad
export const crear = async (req, res) => {
  res.render('nacionalidades/crear', {
    title: 'Nueva Nacionalidad'
  });
};

// Guardar nueva nacionalidad
export const store = async (req, res) => {
  try {
    const { Nombre_Nacionalidad, Codigo_ISO2, Codigo_ISO3 } = req.body;
    
    // Verificar si ya existe
    const existente = await prisma.cat_Nacionalidades.findUnique({
      where: { Nombre_Nacionalidad }
    });
    
    if (existente) {
      req.flash('error', 'Ya existe una nacionalidad con ese nombre');
      return res.redirect('/nacionalidades/crear');
    }
    
    await prisma.cat_Nacionalidades.create({
      data: {
        Nombre_Nacionalidad,
        Codigo_ISO2: Codigo_ISO2 || null,
        Codigo_ISO3: Codigo_ISO3 || null
      }
    });
    
    req.flash('success', 'Nacionalidad creada exitosamente');
    res.redirect('/nacionalidades');
  } catch (error) {
    console.error('Error al crear nacionalidad:', error);
    req.flash('error', 'Error al crear la nacionalidad');
    res.redirect('/nacionalidades/crear');
  }
};

// Formulario para editar nacionalidad
export const editar = async (req, res) => {
  try {
    const { id } = req.params;
    
    const nacionalidad = await prisma.cat_Nacionalidades.findUnique({
      where: { ID_Nacionalidad: parseInt(id) }
    });
    
    if (!nacionalidad) {
      req.flash('error', 'Nacionalidad no encontrada');
      return res.redirect('/nacionalidades');
    }
    
    res.render('nacionalidades/editar', {
      title: 'Editar Nacionalidad',
      nacionalidad
    });
  } catch (error) {
    console.error('Error al obtener nacionalidad:', error);
    req.flash('error', 'Error al cargar la nacionalidad');
    res.redirect('/nacionalidades');
  }
};

// Actualizar nacionalidad
export const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { Nombre_Nacionalidad, Codigo_ISO2, Codigo_ISO3 } = req.body;
    
    await prisma.cat_Nacionalidades.update({
      where: { ID_Nacionalidad: parseInt(id) },
      data: {
        Nombre_Nacionalidad,
        Codigo_ISO2: Codigo_ISO2 || null,
        Codigo_ISO3: Codigo_ISO3 || null
      }
    });
    
    req.flash('success', 'Nacionalidad actualizada exitosamente');
    res.redirect('/nacionalidades');
  } catch (error) {
    console.error('Error al actualizar nacionalidad:', error);
    req.flash('error', 'Error al actualizar la nacionalidad');
    res.redirect(`/nacionalidades/${req.params.id}/editar`);
  }
};

// Eliminar nacionalidad
export const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si tiene empleados asociados
    const empleadosCount = await prisma.empleados.count({
      where: { ID_Nacionalidad: parseInt(id) }
    });
    
    if (empleadosCount > 0) {
      req.flash('error', `No se puede eliminar: hay ${empleadosCount} empleado(s) con esta nacionalidad`);
      return res.redirect('/nacionalidades');
    }
    
    await prisma.cat_Nacionalidades.delete({
      where: { ID_Nacionalidad: parseInt(id) }
    });
    
    req.flash('success', 'Nacionalidad eliminada exitosamente');
    res.redirect('/nacionalidades');
  } catch (error) {
    console.error('Error al eliminar nacionalidad:', error);
    req.flash('error', 'Error al eliminar la nacionalidad');
    res.redirect('/nacionalidades');
  }
};
