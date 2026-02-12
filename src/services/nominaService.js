/**
 * Servicio de Cálculo de Nómina
 * 
 * Configuración:
 * - Pago: SEMANAL (viernes)
 * - Semana laboral: 6 días (Lunes a Sábado) - Domingos NO se trabajan
 * - Salario semanal = salario diario × 7 (incluye domingo de descanso LFT Art. 69/72)
 * - Deducciones controladas por SuperAdmin (IMSS, ISR, préstamos con tasa de interés configurable)
 * - Bono de puntualidad: configurable ($50 default)
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

/**
 * Obtiene TODA la configuración de nómina
 */
export async function getAllConfig() {
  try {
    return await prisma.configuracion_Nomina.findMany({
      where: { Activo: true },
      orderBy: { Clave: 'asc' }
    });
  } catch (error) {
    console.error('Error obteniendo toda la configuración:', error);
    return [];
  }
}

/**
 * Actualiza un parámetro de configuración
 */
export async function updateConfig(clave, valor, updatedBy = null) {
  try {
    return await prisma.configuracion_Nomina.update({
      where: { Clave: clave },
      data: {
        Valor: String(valor),
        UpdatedBy: updatedBy
      }
    });
  } catch (error) {
    console.error(`Error actualizando config ${clave}:`, error);
    throw error;
  }
}

// ============================================================
// CÁLCULO DE NÓMINA SEMANAL
// ============================================================

/**
 * Calcula la nómina semanal de un empleado
 * 
 * FÓRMULA REAL DE NÓMINA (conforme a LFT):
 * - Salario diario = Salario mensual / 30
 * - Salario semanal = Salario diario × 7 (incluye domingo descanso LFT Art. 69/72)
 * - Salario hora = Salario diario / 8
 * - Base: Si trabajó los 6 días (L-S), se paga semanal completo (7 días)
 * - Si faltó, se descuenta proporcionalmente incluyendo parte del domingo
 * - Horas dobles/triples sobre salario hora
 * - Deducciones según config del SuperAdmin
 * 
 * @param {Object} params - Parámetros del cálculo
 * @returns {Object} - Desglose de nómina
 */
export async function calcularNominaSemanal({
  salarioMensual,
  diasTrabajados = 6,  // Días reales trabajados según checador (de 6 posibles L-S)
  horasDobles = 0,
  horasTriples = 0,
  checadasCorrectas = 0,
  diasConChecada = 0,
  faltas = 0,
  empleadoId = null
}) {
  // Obtener configuración completa
  const config = await getConfigMultiple([
    'BONO_PUNTUALIDAD_MONTO',
    'BONO_PUNTUALIDAD_CHECADAS',
    'BONO_PUNTUALIDAD_DIAS',
    'HORAS_EXTRA_DOBLES_LIMITE',
    'CALCULAR_IMSS',
    'CALCULAR_ISR',
    'TASA_IMSS_EMPLEADO',
    'TASA_ISR',
    'PRESTAMOS_TASA_INTERES',
    'PRESTAMOS_ACTIVO'
  ]);

  // ============================================================
  // SALARIOS BASE (LFT)
  // ============================================================
  const diasLaborables = 6; // L-S
  const salarioDiario = redondear(salarioMensual / 30);
  const salarioSemanal = redondear(salarioDiario * 7); // 7 días incluido domingo descanso (LFT Art. 69/72)
  const salarioHora = redondear(salarioDiario / 8);

  // ============================================================
  // PERCEPCIONES
  // ============================================================

  // Salario base semanal
  // Si trabajó los 6 días = pago completo (7 días con domingo)
  // Si faltó, se descuenta proporcionalmente
  let pagoSalarioBase;
  let pagoDomingoLFT = 0;

  if (faltas === 0 && diasTrabajados >= diasLaborables) {
    // Semana completa: 7 días (6 laborales + domingo descanso)
    pagoSalarioBase = salarioSemanal;
    pagoDomingoLFT = salarioDiario;
  } else {
    // Con faltas: pago proporcional + domingo proporcional (LFT Art. 72)
    const diasEfectivos = Math.max(0, diasTrabajados - faltas);
    pagoSalarioBase = redondear(salarioDiario * diasEfectivos);
    pagoDomingoLFT = redondear(salarioDiario * (diasEfectivos / diasLaborables));
    pagoSalarioBase = redondear(pagoSalarioBase + pagoDomingoLFT);
  }

  // Bono de puntualidad (si cumple requisitos)
  let bonoPuntualidad = 0;
  const cumplePuntualidad = 
    checadasCorrectas >= (config.BONO_PUNTUALIDAD_CHECADAS || 12) &&
    diasConChecada >= (config.BONO_PUNTUALIDAD_DIAS || 6) &&
    faltas === 0;
  
  if (cumplePuntualidad) {
    bonoPuntualidad = config.BONO_PUNTUALIDAD_MONTO || 50;
  }

  // Horas extra (ya clasificadas como dobles o triples)
  const pagoHorasDobles = redondear(horasDobles * salarioHora * 2);
  const pagoHorasTriples = redondear(horasTriples * salarioHora * 3);
  const totalHorasExtra = redondear(pagoHorasDobles + pagoHorasTriples);

  // Total percepciones
  const totalPercepciones = redondear(
    pagoSalarioBase + 
    bonoPuntualidad + 
    totalHorasExtra
  );

  // ============================================================
  // DEDUCCIONES (controladas por SuperAdmin)
  // ============================================================
  let deduccionIMSS = 0;
  let deduccionISR = 0;
  let deduccionPrestamo = 0;
  const tasaIMSS = config.TASA_IMSS_EMPLEADO || 2.475;
  const tasaISR = config.TASA_ISR || 0;
  const tasaInteresPrestamos = config.PRESTAMOS_TASA_INTERES || 0;

  // IMSS: solo si está activado en config
  if (config.CALCULAR_IMSS === true) {
    deduccionIMSS = redondear(totalPercepciones * (tasaIMSS / 100));
  }

  // ISR: solo si está activado en config
  if (config.CALCULAR_ISR === true) {
    deduccionISR = redondear(totalPercepciones * (tasaISR / 100));
  }

  // Préstamos: solo si hay un empleado y préstamos activos
  if (empleadoId && config.PRESTAMOS_ACTIVO === true) {
    const prestamoActivo = await prisma.empleados_Prestamos.findFirst({
      where: {
        ID_Empleado: empleadoId,
        Estado: 'ACTIVO'
      }
    });

    if (prestamoActivo) {
      deduccionPrestamo = Number(prestamoActivo.Monto_Por_Pago);
      // Si hay tasa de interés, se aplica al saldo pendiente (interés semanal)
      if (tasaInteresPrestamos > 0) {
        const interesSemanal = redondear(
          Number(prestamoActivo.Monto_Pendiente) * (tasaInteresPrestamos / 100) / 52
        );
        deduccionPrestamo = redondear(deduccionPrestamo + interesSemanal);
      }
    }
  }

  const totalDeducciones = redondear(deduccionIMSS + deduccionISR + deduccionPrestamo);

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
    diasLaborables,
    
    // Percepciones
    percepciones: {
      salarioBase: pagoSalarioBase,
      domingoLFT: pagoDomingoLFT,
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
      imss: deduccionIMSS,
      isr: deduccionISR,
      prestamo: deduccionPrestamo,
      total: totalDeducciones
    },
    
    // Neto
    sueldoNeto,
    
    // Validaciones
    cumplePuntualidad,
    horasExtraTotales: horasDobles + horasTriples,
    
    // Metadata
    calculadoEl: new Date(),
    configuracion: {
      diasLaborablesSemana: 6,
      domingosTrabajados: false,
      calculaIMSS: config.CALCULAR_IMSS === true,
      calculaISR: config.CALCULAR_ISR === true,
      tasaIMSS,
      tasaISR,
      tasaInteresPrestamos,
      prestamosActivo: config.PRESTAMOS_ACTIVO === true
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
 * Nota: Semana laboral = 6 días (L-S), domingos NO se trabajan
 */
export async function evaluarPuntualidad({
  empleadoId,
  fechaInicio,
  fechaFin
}) {
  // Obtener registros de asistencia de la semana (L-S, sin domingos)
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
    // Ignorar domingos (día 0)
    const fecha = new Date(asistencia.Fecha);
    if (fecha.getDay() === 0) {
      continue;
    }

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
    checadasCorrectas >= (config.BONO_PUNTUALIDAD_CHECADAS || 12) &&  // 2 checadas * 6 días
    diasConChecada >= (config.BONO_PUNTUALIDAD_DIAS || 6) &&  // L-S
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
      checadasRequeridas: config.BONO_PUNTUALIDAD_CHECADAS || 12,
      diasRequeridos: config.BONO_PUNTUALIDAD_DIAS || 6,
      diasLaborables: 6  // L-S, domingos NO
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
  getAllConfig,
  updateConfig,
  calcularNominaSemanal,
  calcularFiniquitoEstimado,
  evaluarPuntualidad,
  getSemanaActual
};
