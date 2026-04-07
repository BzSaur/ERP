/**
 * Controlador de Horas Adicionales
 */

import prisma from '../config/database.js';

// Listar horas adicionales
export const index = async (req, res) => {
  try {
    const { empleado, fecha_inicio, fecha_fin, tipo } = req.query;
    
    let where = {};
    
    if (empleado) {
      where.ID_Empleado = parseInt(empleado);
    }
    
    if (fecha_inicio && fecha_fin) {
      where.Fecha = {
        gte: new Date(fecha_inicio),
        lte: new Date(fecha_fin)
      };
    } else if (fecha_inicio) {
      where.Fecha = { gte: new Date(fecha_inicio) };
    } else if (fecha_fin) {
      where.Fecha = { lte: new Date(fecha_fin) };
    }
    
    if (tipo) {
      where.Tipo_Hora = tipo;
    }
    
    const horasAdicionales = await prisma.empleados_Horas_Adicionales.findMany({
      where,
      include: {
        empleado: {
          select: {
            ID_Empleado: true,
            Nombre: true,
            Apellido_Paterno: true,
            Apellido_Materno: true,
            Salario_Hora: true
          }
        }
      },
      orderBy: { Fecha: 'desc' },
      take: 100
    });
    
    const empleados = await prisma.empleados.findMany({
      where: { ID_Estatus: 1 },
      select: {
        ID_Empleado: true,
        Nombre: true,
        Apellido_Paterno: true,
        Apellido_Materno: true
      },
      orderBy: { Nombre: 'asc' }
    });
    
    // Calcular totales
    const totales = {
      presencial: horasAdicionales.filter(h => h.Tipo_Hora === 'PRESENCIAL').reduce((sum, h) => sum + Number(h.Cantidad_Horas), 0),
      enLinea: horasAdicionales.filter(h => h.Tipo_Hora === 'EN_LINEA').reduce((sum, h) => sum + Number(h.Cantidad_Horas), 0),
      extra: horasAdicionales.filter(h => h.Tipo_Hora === 'EXTRA').reduce((sum, h) => sum + Number(h.Cantidad_Horas), 0),
      doble: horasAdicionales.filter(h => h.Tipo_Hora === 'DOBLE').reduce((sum, h) => sum + Number(h.Cantidad_Horas), 0),
      triple: horasAdicionales.filter(h => h.Tipo_Hora === 'TRIPLE').reduce((sum, h) => sum + Number(h.Cantidad_Horas), 0)
    };
    
    res.render('horas-adicionales/index', {
      title: 'Horas Adicionales',
      horasAdicionales,
      empleados,
      filtros: { empleado, fecha_inicio, fecha_fin, tipo },
      totales
    });
  } catch (error) {
    console.error('Error al obtener horas adicionales:', error);
    res.redirect('/?error=' + encodeURIComponent('Error al cargar las horas adicionales'));
  }
};

// Formulario para registrar horas
export const crear = async (req, res) => {
  try {
    const empleados = await prisma.empleados.findMany({
      where: { ID_Estatus: 1 },
      include: {
        puesto: true,
        area: true
      },
      orderBy: { Nombre: 'asc' }
    });
    
    res.render('horas-adicionales/crear', {
      title: 'Registrar Horas Adicionales',
      empleados
    });
  } catch (error) {
    console.error('Error:', error);
    res.redirect('/horas-adicionales?error=' + encodeURIComponent('Error al cargar el formulario'));
  }
};

// Guardar horas adicionales
export const store = async (req, res) => {
  try {
    const { ID_Empleado, Fecha, Tipo_Hora, Cantidad_Horas, Descripcion } = req.body;
    
    await prisma.empleados_Horas_Adicionales.create({
      data: {
        ID_Empleado: parseInt(ID_Empleado),
        Fecha: new Date(Fecha),
        Tipo_Hora,
        Cantidad_Horas: parseFloat(Cantidad_Horas),
        Descripcion: Descripcion || null,
        Aprobado: false,
        CreatedBy: req.session.user?.Email_Office365 || null
      }
    });
    
    res.redirect('/horas-adicionales?created=1');
  } catch (error) {
    console.error('Error al registrar horas:', error);
    res.redirect('/horas-adicionales/crear?error=' + encodeURIComponent('Error al registrar las horas adicionales'));
  }
};

// Editar horas adicionales
export const editar = async (req, res) => {
  try {
    const { id } = req.params;
    
    const horaAdicional = await prisma.empleados_Horas_Adicionales.findUnique({
      where: { ID_Horas: parseInt(id) },
      include: { empleado: true }
    });
    
    if (!horaAdicional) {
      return res.redirect('/horas-adicionales?error=' + encodeURIComponent('Registro no encontrado'));
    }
    
    const empleados = await prisma.empleados.findMany({
      where: { ID_Estatus: 1 },
      orderBy: { Nombre: 'asc' }
    });
    
    res.render('horas-adicionales/editar', {
      title: 'Editar Horas Adicionales',
      horaAdicional,
      empleados
    });
  } catch (error) {
    console.error('Error:', error);
    res.redirect('/horas-adicionales?error=' + encodeURIComponent('Error al cargar el registro'));
  }
};

// Actualizar horas adicionales
export const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { ID_Empleado, Fecha, Tipo_Hora, Cantidad_Horas, Descripcion } = req.body;
    
    await prisma.empleados_Horas_Adicionales.update({
      where: { ID_Horas: parseInt(id) },
      data: {
        ID_Empleado: parseInt(ID_Empleado),
        Fecha: new Date(Fecha),
        Tipo_Hora,
        Cantidad_Horas: parseFloat(Cantidad_Horas),
        Descripcion: Descripcion || null
      }
    });
    
    res.redirect('/horas-adicionales?updated=1');
  } catch (error) {
    console.error('Error al actualizar:', error);
    res.redirect(`/horas-adicionales/${req.params.id}/editar?error=` + encodeURIComponent('Error al actualizar el registro'));
  }
};

// Aprobar horas adicionales
export const aprobar = async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.empleados_Horas_Adicionales.update({
      where: { ID_Horas: parseInt(id) },
      data: {
        Aprobado: true,
        Aprobado_Por: req.user.ID_Usuario,
        Fecha_Aprobacion: new Date()
      }
    });
    
    res.redirect('/horas-adicionales?updated=1');
  } catch (error) {
    console.error('Error al aprobar:', error);
    res.redirect('/horas-adicionales?error=' + encodeURIComponent('Error al aprobar las horas'));
  }
};

// Eliminar horas adicionales
export const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.empleados_Horas_Adicionales.delete({
      where: { ID_Horas: parseInt(id) }
    });
    
    res.redirect('/horas-adicionales?deleted=1');
  } catch (error) {
    console.error('Error al eliminar:', error);
    res.redirect('/horas-adicionales?error=' + encodeURIComponent('Error al eliminar el registro'));
  }
};