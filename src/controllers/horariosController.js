/**
 * Controlador de Horarios
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Listar todos los horarios
export const index = async (req, res) => {
  try {
    const horarios = await prisma.cat_Tipo_Horario.findMany({
      orderBy: { Nombre_Horario: 'asc' }
    });
    
    res.render('horarios/index', {
      title: 'Horarios',
      horarios
    });
  } catch (error) {
    console.error('Error al obtener horarios:', error);
    req.flash('error', 'Error al cargar los horarios');
    res.redirect('/');
  }
};

// Formulario para crear horario
export const crear = async (req, res) => {
  res.render('horarios/crear', {
    title: 'Nuevo Horario'
  });
};

// Guardar nuevo horario
export const store = async (req, res) => {
  try {
    const { Nombre_Horario, Descripcion, Horas_Semana } = req.body;
    
    // Verificar si ya existe
    const existente = await prisma.cat_Tipo_Horario.findUnique({
      where: { Nombre_Horario }
    });
    
    if (existente) {
      req.flash('error', 'Ya existe un horario con ese nombre');
      return res.redirect('/horarios/crear');
    }
    
    await prisma.cat_Tipo_Horario.create({
      data: {
        Nombre_Horario,
        Descripcion: Descripcion || null,
        Horas_Semana: Horas_Semana ? parseInt(Horas_Semana) : null
      }
    });
    
    req.flash('success', 'Horario creado exitosamente');
    res.redirect('/horarios');
  } catch (error) {
    console.error('Error al crear horario:', error);
    req.flash('error', 'Error al crear el horario');
    res.redirect('/horarios/crear');
  }
};

// Formulario para editar horario
export const editar = async (req, res) => {
  try {
    const { id } = req.params;
    
    const horario = await prisma.cat_Tipo_Horario.findUnique({
      where: { ID_Tipo_Horario: parseInt(id) }
    });
    
    if (!horario) {
      req.flash('error', 'Horario no encontrado');
      return res.redirect('/horarios');
    }
    
    res.render('horarios/editar', {
      title: 'Editar Horario',
      horario
    });
  } catch (error) {
    console.error('Error al obtener horario:', error);
    req.flash('error', 'Error al cargar el horario');
    res.redirect('/horarios');
  }
};

// Actualizar horario
export const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { Nombre_Horario, Descripcion, Horas_Semana } = req.body;
    
    await prisma.cat_Tipo_Horario.update({
      where: { ID_Tipo_Horario: parseInt(id) },
      data: {
        Nombre_Horario,
        Descripcion: Descripcion || null,
        Horas_Semana: Horas_Semana ? parseInt(Horas_Semana) : null
      }
    });
    
    req.flash('success', 'Horario actualizado exitosamente');
    res.redirect('/horarios');
  } catch (error) {
    console.error('Error al actualizar horario:', error);
    req.flash('error', 'Error al actualizar el horario');
    res.redirect(`/horarios/${req.params.id}/editar`);
  }
};

// Eliminar horario
export const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si tiene empleados asociados
    const empleadosCount = await prisma.empleados.count({
      where: { ID_Tipo_Horario: parseInt(id) }
    });
    
    if (empleadosCount > 0) {
      req.flash('error', `No se puede eliminar: hay ${empleadosCount} empleado(s) con este horario`);
      return res.redirect('/horarios');
    }
    
    await prisma.cat_Tipo_Horario.delete({
      where: { ID_Tipo_Horario: parseInt(id) }
    });
    
    req.flash('success', 'Horario eliminado exitosamente');
    res.redirect('/horarios');
  } catch (error) {
    console.error('Error al eliminar horario:', error);
    req.flash('error', 'Error al eliminar el horario');
    res.redirect('/horarios');
  }
};
