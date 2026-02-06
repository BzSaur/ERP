/**
 * Servicio de Cálculo de Nómina - RAM
 * Versión simplificada SIN cálculo de ISR
 * 
 * Configuración:
 * - Pago: SEMANAL (viernes)
 * - Sin retención de ISR
 * - Bono de puntualidad: $50 (8 checadas en 6 días)
 * - Horas extra: hasta 9 dobles, después triples
 */

import prisma from '../config/database.js';

// ============================================================
// OBTENER CONFIGURACIÓN DE NÓMINA
// ============================================================

/**
 * Obtiene un parámetro de configuración de nómina
 */
export async function getConfig(clave, valorDefault = null) {
  try {
    const config = await prisma.configuracion_Nomina.findUnique({
      where: { Clave: clave }
    });
    
    if (!config || !config.Activo) {
      return valorDefault;
    }
    
    // Convertir según tipo de dato
    switch (config.Tipo_Dato) {
      case 'INT':
        return parseInt(config.Valor, 10);
      case 'DECIMAL':
        return parseFloat(config.Valor);
      case 'BOOLEAN':
        return config.Valor.toLowerCase() === 'true';
      default:
        return config.Valor;
    }
  } catch (error) {
    console.error(`Error obteniendo config ${clave}:`, error);
    return valorDefault;
  }
}

/**
 * Obtiene múltiples parámetros de configuración
 */
export async function getConfigMultiple(claves) {
  const resultado = {};
  for (const clave of claves) {
    resultado[clave] = await getConfig(clave);
  }
  return resultado;
}

// ============================================================
// CÁLCULO DE NÓMINA SEMANAL
// ============================================================

/**
 * Calcula la nómina semanal de un empleado
 * @param {Object} params - Parámetros del cálculo
 * @returns {Object} - Desglose de nómina
 */
export async function calcularNominaSemanal({
  salarioMensual,
  diasTrabajados = 6,
  horasExtra = 0,
  checadasCorrectas = 0,
  diasConChecada = 0,
  faltas = 0,
  descuentosPrestamos = 0,
  otrosDescuentos = 0
}) {
  // Obtener configuración
  const config = await getConfigMultiple([
    'BONO_PUNTUALIDAD_MONTO',
    'BONO_PUNTUALIDAD_CHECADAS',
    'BONO_PUNTUALIDAD_DIAS',
    'HORAS_EXTRA_DOBLES_LIMITE',
    'CALCULAR_ISR',
    'CALCULAR_IMSS'
  ]);

  // Calcular salarios base
  const salarioDiario = redondear(salarioMensual / 30);
  const salarioSemanal = redondear(salarioMensual / 4.33);
  const salarioHora = redondear(salarioDiario / 8);

  // ============================================================
  // PERCEPCIONES
  // ============================================================

  // Salario proporcional a días trabajados
  const pagoSalarioBase = redondear(salarioDiario * diasTrabajados);

  // Descuento por faltas
  const descuentoFaltas = redondear(salarioDiario * faltas);

  // Bono de puntualidad
  let bonoPuntualidad = 0;
  const cumplePuntualidad = 
    checadasCorrectas >= (config.BONO_PUNTUALIDAD_CHECADAS || 8) &&
    diasConChecada >= (config.BONO_PUNTUALIDAD_DIAS || 6) &&
    faltas === 0;
  
  if (cumplePuntualidad) {
    bonoPuntualidad = config.BONO_PUNTUALIDAD_MONTO || 50;
  }

  // Horas extra
  const limiteDobles = config.HORAS_EXTRA_DOBLES_LIMITE || 9;
  const horasDobles = Math.min(horasExtra, limiteDobles);
  const horasTriples = Math.max(0, horasExtra - limiteDobles);
  
  const pagoHorasDobles = redondear(horasDobles * salarioHora * 2);
  const pagoHorasTriples = redondear(horasTriples * salarioHora * 3);
  const totalHorasExtra = pagoHorasDobles + pagoHorasTriples;

  // Total percepciones
  const totalPercepciones = redondear(
    pagoSalarioBase + 
    bonoPuntualidad + 
    totalHorasExtra
  );

  // ============================================================
  // DEDUCCIONES
  // ============================================================
  
  // ISR - NO SE CALCULA (config de la empresa)
  const deduccionISR = 0;

  // IMSS - Solo si está configurado
  let deduccionIMSS = 0;
  if (config.CALCULAR_IMSS) {
    // Cálculo simplificado de cuota obrera semanal
    // ~2.125% del salario (sum de todas las cuotas obrero)
    deduccionIMSS = redondear(pagoSalarioBase * 0.02125);
  }

  // Otros descuentos
  const totalDescuentos = descuentosPrestamos + otrosDescuentos;

  // Total deducciones
  const totalDeducciones = redondear(
    descuentoFaltas +
    deduccionISR +
    deduccionIMSS +
    totalDescuentos
  );

  // ============================================================
  // NETO A PAGAR
  // ============================================================
  
  const sueldoNeto = redondear(totalPercepciones - totalDeducciones);

  // ============================================================
  // RESULTADO
  // ============================================================
  
  return {
    // Datos base
    salarioMensual,
    salarioDiario,
    salarioSemanal,
    salarioHora,
    
    // Días
    diasTrabajados,
    faltas,
    
    // Percepciones
    percepciones: {
      salarioBase: pagoSalarioBase,
      bonoPuntualidad,
      horasExtraDobles: {
        horas: horasDobles,
        monto: pagoHorasDobles
      },
      horasExtraTriples: {
        horas: horasTriples,
        monto: pagoHorasTriples
      },
      totalHorasExtra,
      total: totalPercepciones
    },
    
    // Deducciones
    deducciones: {
      faltas: descuentoFaltas,
      isr: deduccionISR,
      imss: deduccionIMSS,
      prestamos: descuentosPrestamos,
      otros: otrosDescuentos,
      total: totalDeducciones
    },
    
    // Neto
    sueldoNeto,
    
    // Validaciones
    cumplePuntualidad,
    horasExtraTotales: horasExtra,
    
    // Metadata
    calculadoEl: new Date(),
    configuracion: {
      calculaISR: false,
      calculaIMSS: config.CALCULAR_IMSS || false
    }
  };
}

// ============================================================
// CÁLCULO DE FINIQUITO (para préstamos máximos)
// ============================================================

/**
 * Calcula el finiquito estimado de un empleado
 * Usado para determinar el monto máximo de préstamo
 */
export async function calcularFiniquitoEstimado({
  salarioMensual,
  fechaIngreso,
  fechaCalculo = new Date()
}) {
  const salarioDiario = salarioMensual / 30;
  
  // Calcular antigüedad
  const antiguedadMs = fechaCalculo - new Date(fechaIngreso);
  const antiguedadDias = Math.floor(antiguedadMs / (1000 * 60 * 60 * 24));
  const antiguedadAnios = Math.floor(antiguedadDias / 365);
  
  // Días trabajados del período actual (proporcional)
  const diasPeriodoActual = antiguedadDias % 30; // Días del mes actual
  const pagoDiasTrabajados = redondear(salarioDiario * diasPeriodoActual);
  
  // Vacaciones proporcionales
  const diasVacaciones = calcularDiasVacaciones(antiguedadAnios);
  const vacacionesProporcionales = redondear((diasVacaciones / 365) * antiguedadDias);
  const pagoVacaciones = redondear(salarioDiario * vacacionesProporcionales);
  
  // Prima vacacional (25%)
  const primaVacacional = redondear(pagoVacaciones * 0.25);
  
  // Aguinaldo proporcional
  const diasAguinaldo = 15; // Mínimo de ley
  const aguinaldoProporcional = redondear((diasAguinaldo / 365) * antiguedadDias);
  const pagoAguinaldo = redondear(salarioDiario * aguinaldoProporcional);
  
  // Total finiquito
  const totalFiniquito = redondear(
    pagoDiasTrabajados +
    pagoVacaciones +
    primaVacacional +
    pagoAguinaldo
  );
  
  return {
    salarioDiario,
    antiguedad: {
      dias: antiguedadDias,
      anios: antiguedadAnios
    },
    desglose: {
      diasTrabajados: {
        dias: diasPeriodoActual,
        monto: pagoDiasTrabajados
      },
      vacaciones: {
        diasProporcionales: vacacionesProporcionales,
        monto: pagoVacaciones
      },
      primaVacacional,
      aguinaldo: {
        diasProporcionales: aguinaldoProporcional,
        monto: pagoAguinaldo
      }
    },
    totalFiniquito,
    montoMaximoPrestamo: totalFiniquito // El préstamo máximo es el finiquito
  };
}

// ============================================================
// CÁLCULO DE BONO DE PUNTUALIDAD
// ============================================================

/**
 * Evalúa si un empleado cumple con los requisitos de puntualidad
 */
export async function evaluarPuntualidad({
  empleadoId,
  fechaInicio,
  fechaFin
}) {
  // Obtener registros de asistencia de la semana
  const asistencias = await prisma.empleados_Asistencia.findMany({
    where: {
      ID_Empleado: empleadoId,
      Fecha: {
        gte: fechaInicio,
        lte: fechaFin
      }
    },
    orderBy: { Fecha: 'asc' }
  });

  const config = await getConfigMultiple([
    'BONO_PUNTUALIDAD_CHECADAS',
    'BONO_PUNTUALIDAD_DIAS',
    'BONO_PUNTUALIDAD_MONTO',
    'TOLERANCIA_MINUTOS'
  ]);

  const toleranciaMinutos = config.TOLERANCIA_MINUTOS || 15;
  const horaLimite = new Date();
  horaLimite.setHours(8, toleranciaMinutos, 0, 0);

  let checadasCorrectas = 0;
  let diasConChecada = 0;
  let faltas = 0;
  let retardos = 0;

  for (const asistencia of asistencias) {
    if (!asistencia.Presente) {
      faltas++;
      continue;
    }

    diasConChecada++;

    // Verificar entrada y salida
    if (asistencia.Hora_Entrada && asistencia.Hora_Salida) {
      checadasCorrectas += 2;
      
      // Verificar si llegó tarde
      const horaEntrada = new Date(asistencia.Hora_Entrada);
      if (horaEntrada.getHours() > 8 || 
          (horaEntrada.getHours() === 8 && horaEntrada.getMinutes() > toleranciaMinutos)) {
        retardos++;
      }
    } else if (asistencia.Hora_Entrada || asistencia.Hora_Salida) {
      checadasCorrectas += 1;
    }
  }

  const cumpleRequisitos = 
    checadasCorrectas >= (config.BONO_PUNTUALIDAD_CHECADAS || 8) &&
    diasConChecada >= (config.BONO_PUNTUALIDAD_DIAS || 6) &&
    faltas === 0 &&
    retardos === 0;

  return {
    empleadoId,
    periodo: { fechaInicio, fechaFin },
    diasEvaluados: asistencias.length,
    diasConChecada,
    checadasCorrectas,
    faltas,
    retardos,
    requisitos: {
      checadasRequeridas: config.BONO_PUNTUALIDAD_CHECADAS || 8,
      diasRequeridos: config.BONO_PUNTUALIDAD_DIAS || 6
    },
    cumpleRequisitos,
    montoBono: cumpleRequisitos ? (config.BONO_PUNTUALIDAD_MONTO || 50) : 0
  };
}

// ============================================================
// UTILIDADES
// ============================================================

/**
 * Calcula días de vacaciones según LFT reformada 2023
 */
function calcularDiasVacaciones(aniosAntiguedad) {
  if (aniosAntiguedad < 1) return 0;
  if (aniosAntiguedad === 1) return 12;
  if (aniosAntiguedad === 2) return 14;
  if (aniosAntiguedad === 3) return 16;
  if (aniosAntiguedad === 4) return 18;
  if (aniosAntiguedad === 5) return 20;
  if (aniosAntiguedad <= 10) return 22;
  if (aniosAntiguedad <= 15) return 24;
  if (aniosAntiguedad <= 20) return 26;
  return 28; // Después de 20 años
}

/**
 * Redondea a 2 decimales
 */
function redondear(valor) {
  return Math.round(valor * 100) / 100;
}

/**
 * Obtiene el rango de fechas de la semana actual
 */
export function getSemanaActual() {
  const hoy = new Date();
  const diaSemana = hoy.getDay(); // 0 = domingo
  
  // Calcular lunes de esta semana
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1));
  lunes.setHours(0, 0, 0, 0);
  
  // Calcular sábado de esta semana
  const sabado = new Date(lunes);
  sabado.setDate(lunes.getDate() + 5);
  sabado.setHours(23, 59, 59, 999);
  
  return { lunes, sabado };
}

export default {
  getConfig,
  getConfigMultiple,
  calcularNominaSemanal,
  calcularFiniquitoEstimado,
  evaluarPuntualidad,
  getSemanaActual
};
