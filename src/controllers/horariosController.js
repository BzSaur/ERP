/**
 * Controlador de Horarios
 */

import prisma from '../config/database.js';
import { registrarCambio, obtenerIP } from '../middleware/audit.js';

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
    
    const horario = await prisma.cat_Tipo_Horario.create({
      data: {
        Nombre_Horario,
        Descripcion: Descripcion || null,
        Horas_Semana: Horas_Semana ? parseInt(Horas_Semana) : null
      }
    });
    
    // Registrar en auditoría con énfasis en horas semanales
    await registrarCambio({
      usuario: req.user,
      accion: 'CREATE',
      tabla: 'Cat_Tipo_Horario',
      idRegistro: horario.ID_Tipo_Horario.toString(),
      descripcion: `Creación de horario: ${horario.Nombre_Horario} - Horas semanales: ${horario.Horas_Semana || 'N/A'}`,
      datosNuevos: {
        ID_Tipo_Horario: horario.ID_Tipo_Horario,
        Nombre_Horario: horario.Nombre_Horario,
        Descripcion: horario.Descripcion,
        Horas_Semana: horario.Horas_Semana
      },
      ip: obtenerIP(req)
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
    const idNum = parseInt(id);
    
    // Obtener datos previos para comparar horas
    const horarioPrevio = await prisma.cat_Tipo_Horario.findUnique({
      where: { ID_Tipo_Horario: idNum }
    });
    
    const horario = await prisma.cat_Tipo_Horario.update({
      where: { ID_Tipo_Horario: idNum },
      data: {
        Nombre_Horario,
        Descripcion: Descripcion || null,
        Horas_Semana: Horas_Semana ? parseInt(Horas_Semana) : null
      }
    });
    
    // Descripción con cambios de horas resaltados
    let descripcion = `Actualización de horario: ${horario.Nombre_Horario}`;
    if (horarioPrevio.Horas_Semana !== horario.Horas_Semana) {
      descripcion += ` - Horas semanales: ${horarioPrevio.Horas_Semana || 'N/A'} → ${horario.Horas_Semana || 'N/A'}`;
    }
    
    // Registrar en auditoría
    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'Cat_Tipo_Horario',
      idRegistro: idNum.toString(),
      descripcion,
      datosPrevios: {
        Nombre_Horario: horarioPrevio.Nombre_Horario,
        Descripcion: horarioPrevio.Descripcion,
        Horas_Semana: horarioPrevio.Horas_Semana
      },
      datosNuevos: {
        Nombre_Horario: horario.Nombre_Horario,
        Descripcion: horario.Descripcion,
        Horas_Semana: horario.Horas_Semana
      },
      ip: obtenerIP(req)
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
    const idNum = parseInt(id);
    
    // Verificar si tiene empleados asociados
    const empleadosCount = await prisma.empleados.count({
      where: { ID_Tipo_Horario: idNum }
    });
    
    if (empleadosCount > 0) {
      req.flash('error', `No se puede eliminar: hay ${empleadosCount} empleado(s) con este horario`);
      return res.redirect('/horarios');
    }
    
    // Obtener datos antes de eliminar
    const horario = await prisma.cat_Tipo_Horario.findUnique({
      where: { ID_Tipo_Horario: idNum }
    });
    
    await prisma.cat_Tipo_Horario.delete({
      where: { ID_Tipo_Horario: idNum }
    });
    
    // Registrar en auditoría
    await registrarCambio({
      usuario: req.user,
      accion: 'DELETE',
      tabla: 'Cat_Tipo_Horario',
      idRegistro: idNum.toString(),
      descripcion: `Eliminación de horario: ${horario.Nombre_Horario} - Horas semanales: ${horario.Horas_Semana || 'N/A'}`,
      datosPrevios: {
        ID_Tipo_Horario: horario.ID_Tipo_Horario,
        Nombre_Horario: horario.Nombre_Horario,
        Descripcion: horario.Descripcion,
        Horas_Semana: horario.Horas_Semana
      },
      ip: obtenerIP(req)
    });
    
    req.flash('success', 'Horario eliminado exitosamente');
    res.redirect('/horarios');
  } catch (error) {
    console.error('Error al eliminar horario:', error);
    req.flash('error', 'Error al eliminar el horario');
    res.redirect('/horarios');
  }
};
