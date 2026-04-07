/**
 * Controlador de Vacaciones
 * Cálculo de días de vacaciones según LFT México
 *
 * PROPORCIONALIDAD POR JORNADA:
 * El derecho a vacaciones es proporcional a la jornada.
 * Si la jornada completa es 48h/semana y el empleado trabaja 24h/semana,
 * le corresponde el 50% de los días de vacaciones.
 *
 * Factor de jornada = Horas_Semanales_Contratadas / HORAS_JORNADA_COMPLETA
 * Días proporcionales = Días_LFT × Factor_Jornada
 */

import prisma from '../config/database.js';
import { getConfig } from '../services/nominaService.js';

// Tabla de días de vacaciones según LFT México 2024
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

/**
 * Calcula el factor de jornada para proporcionalidad
 * Factor = horas contratadas / horas jornada completa
 */
async function calcularFactorJornada(empleado) {
  const horasJornadaCompleta = await getConfig('HORAS_JORNADA_COMPLETA', 48);
  const horasContratadas = empleado.Horas_Semanales_Contratadas || horasJornadaCompleta;

  // Si trabaja jornada completa o más, factor = 1
  if (horasContratadas >= horasJornadaCompleta) {
    return 1;
  }

  return horasContratadas / horasJornadaCompleta;
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
    res.redirect('/?error=' + encodeURIComponent('Error al cargar las vacaciones'));
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
        tipo_horario: true,
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

      const diasBase = calcularDiasVacaciones(anosAntiguedad);

      // Calcular factor de jornada para proporcionalidad
      const factorJornada = await calcularFactorJornada(empleado);
      const diasProporcionales = Math.round(diasBase * factorJornada);

      await prisma.vacaciones.create({
        data: {
          ID_Empleado: empleado.ID_Empleado,
          Anio: anioActual,
          Dias_Correspondientes: diasBase,
          Dias_Proporcionales: diasProporcionales,
          Factor_Jornada: factorJornada,
          Dias_Tomados: 0,
          Dias_Pendientes: diasProporcionales, // Usar días proporcionales como disponibles
          Estado: 'PENDIENTE'
        }
      });

      generados++;
    }

    res.redirect('/vacaciones?updated=1');
  } catch (error) {
    console.error('Error al generar vacaciones:', error);
    res.redirect('/vacaciones?error=' + encodeURIComponent('Error al generar las vacaciones'));
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
    res.redirect('/vacaciones?error=' + encodeURIComponent('Error al cargar el formulario'));
  }
};

// Guardar solicitud de vacaciones
export const store = async (req, res) => {
  try {
    const { ID_Empleado, Fecha_Inicio, Fecha_Fin, Observaciones } = req.body;

    const empleado = await prisma.empleados.findUnique({
      where: { ID_Empleado: parseInt(ID_Empleado) },
      include: { tipo_horario: true }
    });

    if (!empleado) {
      return res.redirect('/vacaciones/crear?error=' + encodeURIComponent('Empleado no encontrado'));
    }

    // Calcular antigüedad
    const hoy = new Date();
    const fechaIngreso = new Date(empleado.Fecha_Ingreso);
    const anosAntiguedad = Math.floor((hoy - fechaIngreso) / (365.25 * 24 * 60 * 60 * 1000));

    if (anosAntiguedad < 1) {
      return res.redirect('/vacaciones/crear?error=' + encodeURIComponent('El empleado no cumple 1 año de antigüedad'));
    }

    // Calcular días solicitados
    const inicio = new Date(Fecha_Inicio);
    const fin = new Date(Fecha_Fin);
    const diasSolicitados = Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24)) + 1;

    const diasBase = calcularDiasVacaciones(anosAntiguedad);
    const factorJornada = await calcularFactorJornada(empleado);
    const diasProporcionales = Math.round(diasBase * factorJornada);
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
        return res.redirect('/vacaciones/crear?error=' + encodeURIComponent(`Solo tiene ${vacacionExistente.Dias_Pendientes} días pendientes`));
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
      // Crear nuevo registro con proporcionalidad
      await prisma.vacaciones.create({
        data: {
          ID_Empleado: parseInt(ID_Empleado),
          Anio: anioActual,
          Dias_Correspondientes: diasBase,
          Dias_Proporcionales: diasProporcionales,
          Factor_Jornada: factorJornada,
          Dias_Tomados: diasSolicitados,
          Dias_Pendientes: diasProporcionales - diasSolicitados,
          Fecha_Inicio: inicio,
          Fecha_Fin: fin,
          Estado: 'EN_CURSO',
          Observaciones
        }
      });
    }

    res.redirect('/vacaciones?created=1');
  } catch (error) {
    console.error('Error al guardar vacaciones:', error);
    res.redirect('/vacaciones/crear?error=' + encodeURIComponent('Error al registrar las vacaciones'));
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

    res.redirect('/vacaciones?updated=1');
  } catch (error) {
    console.error('Error:', error);
    res.redirect('/vacaciones?error=' + encodeURIComponent('Error al aprobar las vacaciones'));
  }
};

// Ver elegibilidad de empleados
export const elegibilidad = async (req, res) => {
  try {
    const horasJornadaCompleta = await getConfig('HORAS_JORNADA_COMPLETA', 48);

    const empleados = await prisma.empleados.findMany({
      where: { ID_Estatus: 1 },
      include: {
        puesto: true,
        area: true,
        tipo_horario: true,
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

      const diasBase = calcularDiasVacaciones(anosCompletos);
      const horasContratadas = emp.Horas_Semanales_Contratadas || horasJornadaCompleta;
      const factorJornada = horasContratadas >= horasJornadaCompleta ? 1 : horasContratadas / horasJornadaCompleta;
      const diasProporcionales = Math.round(diasBase * factorJornada);

      const vacacionActual = emp.vacaciones[0];

      return {
        ...emp,
        antiguedad: {
          anos: anosCompletos,
          meses: mesesRestantes
        },
        diasBase,
        diasProporcionales,
        factorJornada: Math.round(factorJornada * 100),
        diasCorrespondientes: diasProporcionales,
        diasPendientes: vacacionActual ? vacacionActual.Dias_Pendientes : diasProporcionales,
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
    res.redirect('/vacaciones?error=' + encodeURIComponent('Error al cargar la elegibilidad'));
  }
};