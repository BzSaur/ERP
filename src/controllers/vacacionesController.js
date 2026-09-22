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
import { registrarCambio, obtenerIP } from '../middleware/audit.js';
import { esFestivo } from '../services/diasFestivosService.js';

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

// Días hábiles (L-V) entre dos fechas @db.Date, ambas inclusive. Sábado,
// domingo y festivos LFT no cuentan: un festivo dentro de un periodo de
// vacaciones no es un día de vacaciones (Art. 74 LFT).
export function contarDiasHabiles(inicio, fin) {
  let dias = 0;
  const cursor = new Date(inicio);
  while (cursor <= fin) {
    const diaSemana = cursor.getUTCDay(); // @db.Date -> medianoche UTC
    if (diaSemana !== 0 && diaSemana !== 6 && !esFestivo(cursor)) dias++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dias;
}

/**
 * Arma la fila que consume la vista: antigüedad, días que le tocan por LFT
 * ajustados por jornada, y los contadores/periodos del año en curso.
 * @param {object} emp        empleado con `vacaciones` (año actual) incluidas
 * @param {number} hoy        timestamp de referencia (mismo para todas las filas)
 * @param {number} horasJornadaCompleta  config HORAS_JORNADA_COMPLETA
 */
function construirFilaEmpleado(emp, hoy, horasJornadaCompleta) {
  const diferenciaMs = hoy - new Date(emp.Fecha_Ingreso);
  const MS_ANIO = 365.25 * 24 * 60 * 60 * 1000;
  const anos = Math.floor(diferenciaMs / MS_ANIO);
  const meses = Math.floor((diferenciaMs % MS_ANIO) / (30.44 * 24 * 60 * 60 * 1000));

  const diasBase = calcularDiasVacaciones(anos);
  const horasContratadas = emp.Horas_Semanales_Contratadas || horasJornadaCompleta;
  const factorJornada = horasContratadas >= horasJornadaCompleta ? 1 : horasContratadas / horasJornadaCompleta;
  const diasProporcionales = Math.round(diasBase * factorJornada);

  const vacacion = emp.vacaciones[0] || null;
  // Los cancelados se listan tachados para dejar rastro de la corrección.
  const periodos = vacacion?.periodos || [];

  return {
    ...emp,
    antiguedad: { anos, meses },
    diasCorrespondientes: diasProporcionales,
    diasTomados: vacacion ? vacacion.Dias_Tomados : 0,
    diasPendientes: vacacion ? vacacion.Dias_Pendientes : diasProporcionales,
    elegible: anos >= 1,
    vacacion,
    periodos
  };
}

// Listar empleados con su derecho a vacaciones y el histórico de periodos.
// Fusiona lo que antes eran dos pantallas (registros + elegibilidad).
export const index = async (req, res) => {
  try {
    // Los periodos que ya terminaron se cierran solos: no hay que volver a
    // confirmarlos a mano.
    await cerrarVacacionesVencidas();

    const { q } = req.query;
    // `buscar` distingue la primera carga (checkbox marcado por defecto) de un
    // submit con el checkbox desmarcado, donde el param no viaja.
    const soloElegibles = req.query.buscar ? req.query.soloElegibles === '1' : true;

    const anioActual = new Date().getFullYear();
    const horasJornadaCompleta = await getConfig('HORAS_JORNADA_COMPLETA', 48);

    const where = { ID_Estatus: 1 };
    if (q?.trim()) {
      const texto = q.trim();
      where.OR = [
        { Nombre: { contains: texto, mode: 'insensitive' } },
        { Apellido_Paterno: { contains: texto, mode: 'insensitive' } },
        { Apellido_Materno: { contains: texto, mode: 'insensitive' } }
      ];
    }

    const empleados = await prisma.empleados.findMany({
      where,
      include: {
        puesto: true,
        area: true,
        vacaciones: {
          where: { Anio: anioActual },
          include: { periodos: { orderBy: { Fecha_Inicio: 'desc' } } }
        }
      },
      orderBy: [{ Nombre: 'asc' }, { Apellido_Paterno: 'asc' }]
    });

    const hoy = Date.now();
    let filas = empleados.map(emp => construirFilaEmpleado(emp, hoy, horasJornadaCompleta));

    const totalNoElegibles = filas.filter(f => !f.elegible).length;
    if (soloElegibles) {
      filas = filas.filter(f => f.elegible);
    }

    const stats = {
      pendientes: await prisma.vacaciones.count({ where: { Estado: 'PENDIENTE' } }),
      enCurso: await prisma.vacaciones.count({ where: { Estado: 'EN_CURSO' } }),
      tomadas: await prisma.vacaciones.count({ where: { Estado: 'TOMADAS' } })
    };

    res.render('vacaciones/index', {
      title: 'Vacaciones',
      filas,
      stats,
      anioActual,
      totalNoElegibles,
      filtros: { q: q || '', soloElegibles }
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

    req.flash('success', `Vacaciones generadas para ${generados} empleado(s) con proporcionalidad por jornada`);
    res.redirect('/vacaciones');
  } catch (error) {
    console.error('Error al generar vacaciones:', error);
    req.flash('error', 'Error al generar las vacaciones');
    res.redirect('/vacaciones');
  }
};

// Empleados elegibles (>=1 año de antigüedad) con sus días pendientes del año
// en curso, para el selector de crear.ejs y su preview de saldo en vivo.
async function empleadosElegiblesParaCrear() {
  const anioActual = new Date().getFullYear();
  const hoy = Date.now();
  const todos = await prisma.empleados.findMany({
    where: { ID_Estatus: 1 },
    include: { vacaciones: { where: { Anio: anioActual } } },
    orderBy: { Nombre: 'asc' }
  });

  return todos
    .map(emp => {
      const anos = Math.floor((hoy - new Date(emp.Fecha_Ingreso)) / (365.25 * 24 * 60 * 60 * 1000));
      const vacacion = emp.vacaciones[0] || null;
      return { ...emp, elegible: anos >= 1, diasPendientes: vacacion?.Dias_Pendientes ?? null };
    })
    .filter(emp => emp.elegible);
}

// Formulario para registrar vacaciones de un empleado
export const crear = async (req, res) => {
  try {
    const empleados = await empleadosElegiblesParaCrear();

    res.render('vacaciones/crear', {
      title: 'Registrar Vacaciones',
      empleados,
      valores: { ID_Empleado: '', Fecha_Inicio: '', Fecha_Fin: '', Observaciones: '' }
    });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al cargar el formulario');
    res.redirect('/vacaciones');
  }
};

// Guardar solicitud de vacaciones.
// Cada registro crea una fila PERMANENTE en Vacaciones_Periodos (histórico:
// quién, cuándo, cuántos días). Acepta fechas pasadas para capturar
// retroactivamente periodos ya gozados. Vacaciones (anual) solo acumula
// contadores; sus Fecha_Inicio/Fin quedan como legacy del último periodo.
export const store = async (req, res) => {
  const { ID_Empleado, Fecha_Inicio, Fecha_Fin, Observaciones } = req.body;
  const valores = { ID_Empleado, Fecha_Inicio, Fecha_Fin, Observaciones };

  // En vez de flash + redirect: re-renderiza crear.ejs con lo que el usuario
  // ya había escrito, para no obligarlo a capturar todo de nuevo tras un
  // error de negocio (traslape, saldo insuficiente, etc).
  const errorConValores = async (mensaje) => {
    const empleados = await empleadosElegiblesParaCrear();
    return res.render('vacaciones/crear', {
      title: 'Registrar Vacaciones',
      empleados,
      valores,
      errorFormulario: mensaje
    });
  };

  try {
    const empleado = await prisma.empleados.findUnique({
      where: { ID_Empleado: parseInt(ID_Empleado) },
      include: { tipo_horario: true }
    });

    if (!empleado) {
      return errorConValores('Empleado no encontrado');
    }

    // Calcular antigüedad
    const hoy = new Date();
    const fechaIngreso = new Date(empleado.Fecha_Ingreso);
    const anosAntiguedad = Math.floor((hoy - fechaIngreso) / (365.25 * 24 * 60 * 60 * 1000));

    if (anosAntiguedad < 1) {
      return errorConValores('El empleado no cumple 1 año de antigüedad');
    }

    // Fechas del periodo ('YYYY-MM-DD' -> medianoche UTC, correcto para @db.Date)
    const inicio = new Date(Fecha_Inicio);
    const fin = new Date(Fecha_Fin);
    if (isNaN(inicio.getTime()) || isNaN(fin.getTime()) || fin < inicio) {
      return errorConValores('Rango de fechas inválido');
    }
    const diasSolicitados = contarDiasHabiles(inicio, fin);
    if (diasSolicitados === 0) {
      return errorConValores('El rango no incluye ningún día hábil (L-V)');
    }

    // No permitir traslape con otro periodo aprobado del mismo empleado
    const traslape = await prisma.vacaciones_Periodos.findFirst({
      where: {
        ID_Empleado: parseInt(ID_Empleado),
        Estado: 'APROBADO',
        Fecha_Inicio: { lte: fin },
        Fecha_Fin: { gte: inicio }
      }
    });
    if (traslape) {
      return errorConValores('El rango se traslapa con un periodo de vacaciones ya registrado');
    }

    const diasBase = calcularDiasVacaciones(anosAntiguedad);
    const factorJornada = await calcularFactorJornada(empleado);
    const diasProporcionales = Math.round(diasBase * factorJornada);
    // Año del PERIODO (no el actual): capturar un periodo de otro año carga
    // los días al registro anual correcto.
    const anioPeriodo = inicio.getUTCFullYear();

    // Verificar si ya tiene registro de vacaciones
    const vacacionExistente = await prisma.vacaciones.findUnique({
      where: {
        ID_Empleado_Anio: {
          ID_Empleado: parseInt(ID_Empleado),
          Anio: anioPeriodo
        }
      }
    });

    let idVacacion;
    if (vacacionExistente) {
      // Verificar días disponibles
      if (diasSolicitados > vacacionExistente.Dias_Pendientes) {
        return errorConValores(`Solo tiene ${vacacionExistente.Dias_Pendientes} día(s) hábil(es) pendientes`);
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
      idVacacion = vacacionExistente.ID_Vacacion;
    } else {
      // Crear nuevo registro con proporcionalidad
      const creada = await prisma.vacaciones.create({
        data: {
          ID_Empleado: parseInt(ID_Empleado),
          Anio: anioPeriodo,
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
      idVacacion = creada.ID_Vacacion;
    }

    // Fila permanente del periodo (histórico y fuente para asistencia/nómina)
    await prisma.vacaciones_Periodos.create({
      data: {
        ID_Vacacion: idVacacion,
        ID_Empleado: parseInt(ID_Empleado),
        Fecha_Inicio: inicio,
        Fecha_Fin: fin,
        Dias: diasSolicitados,
        Estado: 'APROBADO',
        Aprobado_Por: req.user?.ID_Usuario || null,
        Observaciones: Observaciones || null,
        CreatedBy: req.session?.user?.Email_Office365 || null
      }
    });

    req.flash('success', `Vacaciones registradas: ${diasSolicitados} día(s)`);
    res.redirect('/vacaciones');
  } catch (error) {
    console.error('Error al guardar vacaciones:', error);
    req.flash('error', 'Error al registrar las vacaciones');
    res.redirect('/vacaciones/crear');
  }
};

/**
 * Cierra los registros EN_CURSO cuyos periodos aprobados ya terminaron:
 * pasan a TOMADAS sin necesidad de confirmarlos a mano. Si más adelante se
 * les agrega un periodo futuro, `store` los regresa a EN_CURSO por su cuenta.
 *
 * Se llama al entrar a la pantalla de vacaciones (no hay tareas programadas
 * en el proyecto): es un solo UPDATE indexado por Estado.
 * @returns {Promise<number>} cuántos registros se cerraron
 */
export async function cerrarVacacionesVencidas() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const { count } = await prisma.vacaciones.updateMany({
    where: {
      Estado: 'EN_CURSO',
      // Ningún periodo vigente que siga en curso o por venir.
      periodos: { none: { Estado: 'APROBADO', Fecha_Fin: { gte: hoy } } }
    },
    data: { Estado: 'TOMADAS' }
  });
  return count;
}

// GET /vacaciones/periodos/:id/editar - Formulario de edición de un periodo
export const editarPeriodo = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const periodo = await prisma.vacaciones_Periodos.findUnique({
      where: { ID_Periodo_Vac: id },
      include: {
        empleado: { select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true } },
        vacacion: { select: { ID_Vacacion: true, Anio: true, Dias_Proporcionales: true, Dias_Tomados: true, Dias_Pendientes: true } }
      }
    });

    if (!periodo) {
      req.flash('error', 'Periodo de vacaciones no encontrado');
      return res.redirect('/vacaciones');
    }

    const fmt = (d) => new Date(d).toISOString().slice(0, 10);
    res.render('vacaciones/editar-periodo', {
      title: 'Editar periodo de vacaciones',
      periodo,
      fechaInicio: fmt(periodo.Fecha_Inicio),
      fechaFin: fmt(periodo.Fecha_Fin)
    });
  } catch (error) {
    console.error('Error al cargar periodo:', error);
    req.flash('error', 'Error al cargar el periodo');
    res.redirect('/vacaciones');
  }
};

// POST /vacaciones/periodos/:id - Actualizar fechas/observaciones del periodo.
// Ajusta el saldo del registro anual: devuelve los días viejos y descuenta los
// nuevos, para que Dias_Tomados/Dias_Pendientes no se corrompan.
export const actualizarPeriodo = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const periodo = await prisma.vacaciones_Periodos.findUnique({
      where: { ID_Periodo_Vac: id },
      include: { vacacion: true }
    });
    if (!periodo) {
      req.flash('error', 'Periodo de vacaciones no encontrado');
      return res.redirect('/vacaciones');
    }
    const volver = `/vacaciones/periodos/${id}/editar`;

    const inicio = new Date(req.body.Fecha_Inicio);
    const fin = new Date(req.body.Fecha_Fin);
    if (isNaN(inicio.getTime()) || isNaN(fin.getTime()) || fin < inicio) {
      req.flash('error', 'Rango de fechas inválido');
      return res.redirect(volver);
    }
    const diasNuevos = contarDiasHabiles(inicio, fin);
    if (diasNuevos === 0) {
      req.flash('error', 'El rango no incluye ningún día hábil (L-V)');
      return res.redirect(volver);
    }
    const diasViejos = periodo.Dias;

    // Traslape con OTRO periodo aprobado del mismo empleado (no consigo mismo).
    const traslape = await prisma.vacaciones_Periodos.findFirst({
      where: {
        ID_Empleado: periodo.ID_Empleado,
        Estado: 'APROBADO',
        ID_Periodo_Vac: { not: id },
        Fecha_Inicio: { lte: fin },
        Fecha_Fin: { gte: inicio }
      }
    });
    if (traslape) {
      req.flash('error', 'El nuevo rango se traslapa con otro periodo ya registrado');
      return res.redirect(volver);
    }

    // Si el periodo está activo, validar que el saldo alcance para los días extra.
    const delta = diasNuevos - diasViejos;
    if (periodo.Estado === 'APROBADO' && delta > 0 && periodo.vacacion) {
      if (delta > periodo.vacacion.Dias_Pendientes) {
        req.flash('error', `Solo hay ${periodo.vacacion.Dias_Pendientes} día(s) pendientes; el cambio requiere ${delta} más`);
        return res.redirect(volver);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.vacaciones_Periodos.update({
        where: { ID_Periodo_Vac: id },
        data: {
          Fecha_Inicio: inicio,
          Fecha_Fin: fin,
          Dias: diasNuevos,
          Observaciones: req.body.Observaciones || null
        }
      });
      // El saldo anual solo se mueve si el periodo está vigente.
      if (periodo.Estado === 'APROBADO' && periodo.vacacion && delta !== 0) {
        await tx.vacaciones.update({
          where: { ID_Vacacion: periodo.ID_Vacacion },
          data: {
            Dias_Tomados: periodo.vacacion.Dias_Tomados + delta,
            Dias_Pendientes: periodo.vacacion.Dias_Pendientes - delta
          }
        });
      }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'Vacaciones_Periodos',
      idRegistro: id.toString(),
      descripcion: `Periodo de vacaciones editado (empleado ${periodo.ID_Empleado}): ${diasViejos} → ${diasNuevos} día(s)`,
      datosPrevios: { Fecha_Inicio: periodo.Fecha_Inicio, Fecha_Fin: periodo.Fecha_Fin, Dias: diasViejos },
      datosNuevos: { Fecha_Inicio: inicio, Fecha_Fin: fin, Dias: diasNuevos },
      ip: obtenerIP(req)
    });

    req.flash('success', 'Periodo de vacaciones actualizado');
    res.redirect('/vacaciones');
  } catch (error) {
    console.error('Error al actualizar periodo:', error);
    req.flash('error', 'Error al actualizar el periodo');
    res.redirect('/vacaciones');
  }
};

// POST /vacaciones/periodos/:id/cancelar - Cancela el periodo (no lo borra) y
// devuelve sus días al saldo anual del empleado.
export const cancelarPeriodo = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const periodo = await prisma.vacaciones_Periodos.findUnique({
      where: { ID_Periodo_Vac: id },
      include: { vacacion: true }
    });
    if (!periodo) {
      req.flash('error', 'Periodo de vacaciones no encontrado');
      return res.redirect('/vacaciones');
    }
    if (periodo.Estado === 'CANCELADO') {
      req.flash('info', 'Ese periodo ya estaba cancelado');
      return res.redirect('/vacaciones');
    }

    await prisma.$transaction(async (tx) => {
      await tx.vacaciones_Periodos.update({
        where: { ID_Periodo_Vac: id },
        data: {
          Estado: 'CANCELADO',
          Observaciones: [periodo.Observaciones, req.body.Motivo_Cancelacion?.trim()].filter(Boolean).join(' · ') || null
        }
      });
      // Devolver los días al saldo del año correspondiente.
      if (periodo.vacacion) {
        await tx.vacaciones.update({
          where: { ID_Vacacion: periodo.ID_Vacacion },
          data: {
            Dias_Tomados: Math.max(0, periodo.vacacion.Dias_Tomados - periodo.Dias),
            Dias_Pendientes: periodo.vacacion.Dias_Pendientes + periodo.Dias
          }
        });
      }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'Vacaciones_Periodos',
      idRegistro: id.toString(),
      descripcion: `Periodo de vacaciones CANCELADO (empleado ${periodo.ID_Empleado}): se devolvieron ${periodo.Dias} día(s) al saldo`,
      datosPrevios: { Estado: periodo.Estado, Dias: periodo.Dias },
      datosNuevos: { Estado: 'CANCELADO' },
      ip: obtenerIP(req)
    });

    req.flash('success', `Periodo cancelado — ${periodo.Dias} día(s) devueltos al saldo del empleado`);
    res.redirect('/vacaciones');
  } catch (error) {
    console.error('Error al cancelar periodo:', error);
    req.flash('error', 'Error al cancelar el periodo');
    res.redirect('/vacaciones');
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

