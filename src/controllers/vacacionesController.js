/**
 * Controlador de Vacaciones
 * Cálculo de días de vacaciones según LFT México
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Tabla de días de vacaciones según LFT México 2024
// Art. 76: 12 días primer año, incremento 2 días por año hasta el 5to
// Después incrementa 2 días cada 5 años
const DIAS_VACACIONES_LFT = {
  1: 12,
  2: 14,
  3: 16,
  4: 18,
  5: 20,
  6: 22,  // 6-10 años
  11: 24, // 11-15 años
  16: 26, // 16-20 años
  21: 28, // 21-25 años
  26: 30, // 26-30 años
  31: 32  // 31+ años
};

// Calcular días correspondientes según antigüedad
function calcularDiasVacaciones(anosAntiguedad) {
  if (anosAntiguedad <= 0) return 0;
  if (anosAntiguedad <= 5) return DIAS_VACACIONES_LFT[anosAntiguedad];
  if (anosAntiguedad <= 10) return 22;
  if (anosAntiguedad <= 15) return 24;
  if (anosAntiguedad <= 20) return 26;
  if (anosAntiguedad <= 25) return 28;
  if (anosAntiguedad <= 30) return 30;
  return 32;
}

// Listar vacaciones
export const index = async (req, res) => {
  try {
    const { anio, estado, empleado } = req.query;
    
    let where = {};
    
    if (anio) {
      where.Anio = parseInt(anio);
    }
    
    if (estado) {
      where.Estado = estado;
    }
    
    if (empleado) {
      where.ID_Empleado = parseInt(empleado);
    }
    
    const vacaciones = await prisma.vacaciones.findMany({
      where,
      include: {
        empleado: {
          select: {
            ID_Empleado: true,
            Nombre: true,
            Apellido_Paterno: true,
            Apellido_Materno: true,
            Fecha_Ingreso: true
          }
        }
      },
      orderBy: [{ Anio: 'desc' }, { empleado: { Nombre: 'asc' } }],
      take: 100
    });
    
    const empleados = await prisma.empleados.findMany({
      where: { ID_Estatus: 1 },
      select: {
        ID_Empleado: true,
        Nombre: true,
        Apellido_Paterno: true
      },
      orderBy: { Nombre: 'asc' }
    });
    
    // Estadísticas
    const stats = {
      pendientes: await prisma.vacaciones.count({ where: { Estado: 'PENDIENTE' } }),
      enCurso: await prisma.vacaciones.count({ where: { Estado: 'EN_CURSO' } }),
      tomadas: await prisma.vacaciones.count({ where: { Estado: 'TOMADAS' } })
    };
    
    res.render('vacaciones/index', {
      title: 'Vacaciones',
      vacaciones,
      empleados,
      stats,
      filtros: { anio, estado, empleado }
    });
  } catch (error) {
    console.error('Error al obtener vacaciones:', error);
    req.flash('error', 'Error al cargar las vacaciones');
    res.redirect('/');
  }
};

// Generar vacaciones para todos los empleados elegibles
export const generarVacaciones = async (req, res) => {
  try {
    const anioActual = new Date().getFullYear();
    const hoy = new Date();
    
    // Obtener empleados activos
    const empleados = await prisma.empleados.findMany({
      where: { ID_Estatus: 1 },
      include: {
        vacaciones: {
          where: { Anio: anioActual }
        }
      }
    });
    
    let generados = 0;
    
    for (const empleado of empleados) {
      // Verificar si ya tiene vacaciones para este año
      if (empleado.vacaciones.length > 0) continue;
      
      // Calcular antigüedad
      const fechaIngreso = new Date(empleado.Fecha_Ingreso);
      const diferenciaMs = hoy - fechaIngreso;
      const anosAntiguedad = Math.floor(diferenciaMs / (365.25 * 24 * 60 * 60 * 1000));
      
      // Solo generar si tiene al menos 1 año
      if (anosAntiguedad < 1) continue;
      
      const diasCorrespondientes = calcularDiasVacaciones(anosAntiguedad);
      
      await prisma.vacaciones.create({
        data: {
          ID_Empleado: empleado.ID_Empleado,
          Anio: anioActual,
          Dias_Correspondientes: diasCorrespondientes,
          Dias_Tomados: 0,
          Dias_Pendientes: diasCorrespondientes,
          Estado: 'PENDIENTE'
        }
      });
      
      generados++;
    }
    
    req.flash('success', `Vacaciones generadas para ${generados} empleado(s)`);
    res.redirect('/vacaciones');
  } catch (error) {
    console.error('Error al generar vacaciones:', error);
    req.flash('error', 'Error al generar las vacaciones');
    res.redirect('/vacaciones');
  }
};

// Formulario para registrar vacaciones de un empleado
export const crear = async (req, res) => {
  try {
    const empleados = await prisma.empleados.findMany({
      where: { ID_Estatus: 1 },
      orderBy: { Nombre: 'asc' }
    });
    
    res.render('vacaciones/crear', {
      title: 'Registrar Vacaciones',
      empleados
    });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al cargar el formulario');
    res.redirect('/vacaciones');
  }
};

// Guardar solicitud de vacaciones
export const store = async (req, res) => {
  try {
    const { ID_Empleado, Fecha_Inicio, Fecha_Fin, Observaciones } = req.body;
    
    const empleado = await prisma.empleados.findUnique({
      where: { ID_Empleado: parseInt(ID_Empleado) }
    });
    
    if (!empleado) {
      req.flash('error', 'Empleado no encontrado');
      return res.redirect('/vacaciones/crear');
    }
    
    // Calcular antigüedad
    const hoy = new Date();
    const fechaIngreso = new Date(empleado.Fecha_Ingreso);
    const anosAntiguedad = Math.floor((hoy - fechaIngreso) / (365.25 * 24 * 60 * 60 * 1000));
    
    if (anosAntiguedad < 1) {
      req.flash('error', 'El empleado no cumple 1 año de antigüedad');
      return res.redirect('/vacaciones/crear');
    }
    
    // Calcular días solicitados
    const inicio = new Date(Fecha_Inicio);
    const fin = new Date(Fecha_Fin);
    const diasSolicitados = Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24)) + 1;
    
    const diasCorrespondientes = calcularDiasVacaciones(anosAntiguedad);
    const anioActual = new Date().getFullYear();
    
    // Verificar si ya tiene registro de vacaciones
    const vacacionExistente = await prisma.vacaciones.findUnique({
      where: {
        ID_Empleado_Anio: {
          ID_Empleado: parseInt(ID_Empleado),
          Anio: anioActual
        }
      }
    });
    
    if (vacacionExistente) {
      // Verificar días disponibles
      if (diasSolicitados > vacacionExistente.Dias_Pendientes) {
        req.flash('error', `Solo tiene ${vacacionExistente.Dias_Pendientes} días pendientes`);
        return res.redirect('/vacaciones/crear');
      }
      
      // Actualizar vacaciones existentes
      await prisma.vacaciones.update({
        where: { ID_Vacacion: vacacionExistente.ID_Vacacion },
        data: {
          Fecha_Inicio: inicio,
          Fecha_Fin: fin,
          Dias_Tomados: vacacionExistente.Dias_Tomados + diasSolicitados,
          Dias_Pendientes: vacacionExistente.Dias_Pendientes - diasSolicitados,
          Estado: 'EN_CURSO',
          Observaciones
        }
      });
    } else {
      // Crear nuevo registro
      await prisma.vacaciones.create({
        data: {
          ID_Empleado: parseInt(ID_Empleado),
          Anio: anioActual,
          Dias_Correspondientes: diasCorrespondientes,
          Dias_Tomados: diasSolicitados,
          Dias_Pendientes: diasCorrespondientes - diasSolicitados,
          Fecha_Inicio: inicio,
          Fecha_Fin: fin,
          Estado: 'EN_CURSO',
          Observaciones
        }
      });
    }
    
    req.flash('success', 'Vacaciones registradas exitosamente');
    res.redirect('/vacaciones');
  } catch (error) {
    console.error('Error al guardar vacaciones:', error);
    req.flash('error', 'Error al registrar las vacaciones');
    res.redirect('/vacaciones/crear');
  }
};

// Aprobar vacaciones
export const aprobar = async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.vacaciones.update({
      where: { ID_Vacacion: parseInt(id) },
      data: {
        Estado: 'TOMADAS',
        Aprobado_Por: req.user.ID_Usuario,
        Fecha_Aprobacion: new Date()
      }
    });
    
    req.flash('success', 'Vacaciones aprobadas');
    res.redirect('/vacaciones');
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al aprobar las vacaciones');
    res.redirect('/vacaciones');
  }
};

// Ver elegibilidad de empleados
export const elegibilidad = async (req, res) => {
  try {
    const empleados = await prisma.empleados.findMany({
      where: { ID_Estatus: 1 },
      include: {
        puesto: true,
        area: true,
        vacaciones: {
          where: { Anio: new Date().getFullYear() }
        }
      },
      orderBy: { Fecha_Ingreso: 'asc' }
    });
    
    const hoy = new Date();
    
    const empleadosConAntiguedad = empleados.map(emp => {
      const fechaIngreso = new Date(emp.Fecha_Ingreso);
      const diferenciaMs = hoy - fechaIngreso;
      const anosCompletos = Math.floor(diferenciaMs / (365.25 * 24 * 60 * 60 * 1000));
      const mesesRestantes = Math.floor((diferenciaMs % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));
      
      const diasCorrespondientes = calcularDiasVacaciones(anosCompletos);
      const vacacionActual = emp.vacaciones[0];
      
      return {
        ...emp,
        antiguedad: {
          anos: anosCompletos,
          meses: mesesRestantes
        },
        diasCorrespondientes,
        diasPendientes: vacacionActual ? vacacionActual.Dias_Pendientes : diasCorrespondientes,
        elegible: anosCompletos >= 1,
        tieneRegistro: !!vacacionActual
      };
    });
    
    res.render('vacaciones/elegibilidad', {
      title: 'Elegibilidad de Vacaciones',
      empleados: empleadosConAntiguedad,
      anioActual: new Date().getFullYear()
    });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al cargar la elegibilidad');
    res.redirect('/vacaciones');
  }
};
