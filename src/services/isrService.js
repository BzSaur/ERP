/**
 * Servicio de Cálculo de ISR
 * Implementa el cálculo de Impuesto Sobre la Renta según LISR Art. 96
 * y las tablas publicadas por el SAT.
 */

import prisma from '../config/database.js';

// ============================================================
// CÁLCULO DE ISR
// ============================================================

/**
 * Calcula el ISR a retener sobre un ingreso gravable
 * @param {number} ingresoGravable - Base gravable del período
 * @param {string} tipoPeriodo - MENSUAL, QUINCENAL, SEMANAL, DIARIA
 * @param {number} anioFiscal - Año fiscal para usar las tablas correctas
 * @returns {Object} - { isr, subsidio, isrNeto, rangoAplicado }
 */
export async function calcularISR(ingresoGravable, tipoPeriodo = 'QUINCENAL', anioFiscal = new Date().getFullYear()) {
  try {
    // Obtener tabla de ISR para el período
    const tablasISR = await prisma.tablas_ISR.findMany({
      where: {
        Anio_Fiscal: anioFiscal,
        Tipo_Tabla: tipoPeriodo,
        Activo: true
      },
      orderBy: { Limite_Inferior: 'asc' }
    });

    if (tablasISR.length === 0) {
      throw new Error(`No se encontraron tablas ISR para ${tipoPeriodo} del año ${anioFiscal}`);
    }

    // Buscar el rango aplicable
    const rangoAplicado = tablasISR.find(rango => 
      ingresoGravable >= parseFloat(rango.Limite_Inferior) && 
      ingresoGravable <= parseFloat(rango.Limite_Superior)
    );

    if (!rangoAplicado) {
      // Si excede el último rango, usar el último
      const ultimoRango = tablasISR[tablasISR.length - 1];
      if (ingresoGravable > parseFloat(ultimoRango.Limite_Superior)) {
        // Aplicar tasa máxima
        const excedente = ingresoGravable - parseFloat(ultimoRango.Limite_Inferior);
        const isrExcedente = excedente * parseFloat(ultimoRango.Porcentaje_Excedente);
        const isr = parseFloat(ultimoRango.Cuota_Fija) + isrExcedente;
        
        return {
          isr: redondear(isr),
          subsidio: 0,
          isrNeto: redondear(isr),
          rangoAplicado: ultimoRango,
          detalleCalculo: {
            ingresoGravable,
            limiteInferior: parseFloat(ultimoRango.Limite_Inferior),
            excedente,
            porcentajeExcedente: parseFloat(ultimoRango.Porcentaje_Excedente),
            isrExcedente,
            cuotaFija: parseFloat(ultimoRango.Cuota_Fija)
          }
        };
      }
      throw new Error('No se encontró rango de ISR aplicable');
    }

    // Calcular ISR según fórmula:
    // ISR = Cuota Fija + (Excedente sobre límite inferior × Porcentaje)
    const excedente = ingresoGravable - parseFloat(rangoAplicado.Limite_Inferior);
    const isrExcedente = excedente * parseFloat(rangoAplicado.Porcentaje_Excedente);
    const isrBruto = parseFloat(rangoAplicado.Cuota_Fija) + isrExcedente;

    // Calcular subsidio al empleo si aplica
    const subsidio = await calcularSubsidioEmpleo(ingresoGravable, tipoPeriodo, anioFiscal);

    // ISR neto = ISR bruto - Subsidio (mínimo 0)
    const isrNeto = Math.max(0, isrBruto - subsidio);

    return {
      isr: redondear(isrBruto),
      subsidio: redondear(subsidio),
      isrNeto: redondear(isrNeto),
      rangoAplicado,
      detalleCalculo: {
        ingresoGravable,
        limiteInferior: parseFloat(rangoAplicado.Limite_Inferior),
        excedente: redondear(excedente),
        porcentajeExcedente: parseFloat(rangoAplicado.Porcentaje_Excedente),
        isrExcedente: redondear(isrExcedente),
        cuotaFija: parseFloat(rangoAplicado.Cuota_Fija)
      }
    };
  } catch (error) {
    console.error('Error calculando ISR:', error);
    throw error;
  }
}

/**
 * Calcula el subsidio al empleo según tablas del SAT
 * @param {number} ingresoGravable - Base gravable del período
 * @param {string} tipoPeriodo - MENSUAL, QUINCENAL, SEMANAL
 * @param {number} anioFiscal - Año fiscal
 * @returns {number} - Monto de subsidio
 */
export async function calcularSubsidioEmpleo(ingresoGravable, tipoPeriodo = 'QUINCENAL', anioFiscal = new Date().getFullYear()) {
  try {
    // Convertir período para tabla de subsidio (generalmente mensual)
    let tipoTabla = tipoPeriodo;
    let factorConversion = 1;

    // El subsidio generalmente está en tabla mensual, hay que convertir
    if (tipoPeriodo === 'QUINCENAL') {
      tipoTabla = 'MENSUAL';
      factorConversion = 2; // 2 quincenas = 1 mes
    } else if (tipoPeriodo === 'SEMANAL') {
      tipoTabla = 'MENSUAL';
      factorConversion = 4.33; // ~4.33 semanas = 1 mes
    }

    // Convertir ingreso a base mensual para buscar en tabla
    const ingresoMensualizado = ingresoGravable * factorConversion;

    const tablasSubsidio = await prisma.tablas_Subsidio_Empleo.findMany({
      where: {
        Anio_Fiscal: anioFiscal,
        Tipo_Tabla: tipoTabla,
        Activo: true
      },
      orderBy: { Limite_Inferior: 'asc' }
    });

    if (tablasSubsidio.length === 0) {
      // Si no hay tabla de subsidio, retornar 0
      return 0;
    }

    // Buscar el rango aplicable
    const rangoAplicado = tablasSubsidio.find(rango =>
      ingresoMensualizado >= parseFloat(rango.Limite_Inferior) &&
      ingresoMensualizado <= parseFloat(rango.Limite_Superior)
    );

    if (!rangoAplicado) {
      return 0;
    }

    // Devolver subsidio proporcional al período
    const subsidioMensual = parseFloat(rangoAplicado.Subsidio);
    return redondear(subsidioMensual / factorConversion);
  } catch (error) {
    console.error('Error calculando subsidio:', error);
    return 0;
  }
}

// ============================================================
// CÁLCULOS DE NÓMINA COMPLETOS
// ============================================================

/**
 * Calcula las percepciones gravables y exentas
 * @param {Object} percepciones - Objeto con todas las percepciones
 * @returns {Object} - { gravable, exento, total }
 */
export function separarPercepcionesGravables(percepciones) {
  const UMA_2026 = 113.14; // Valor UMA 2026 (actualizar cada año)
  const UMA_MENSUAL = UMA_2026 * 30;

  // Reglas de exención según LISR
  const reglas = {
    // Horas extra: exentas hasta cierto límite (LFT + LISR)
    horasExtra: {
      exentoHasta: (valor) => Math.min(valor * 0.5, UMA_2026 * 5 * 7) // 50% exento hasta 5 UMA semanales
    },
    // Prima vacacional: exenta hasta 15 UMA
    primaVacacional: {
      exentoHasta: () => UMA_2026 * 15
    },
    // Aguinaldo: exento hasta 30 UMA
    aguinaldo: {
      exentoHasta: () => UMA_2026 * 30
    },
    // Vales de despensa: exentos hasta 40% UMA mensual
    valesDespensa: {
      exentoHasta: () => UMA_MENSUAL * 0.40
    },
    // Fondo de ahorro: exento hasta 13% del salario
    fondoAhorro: {
      exentoHasta: (valor, salarioBase) => Math.min(valor, salarioBase * 0.13)
    },
    // PTU: exenta hasta 15 UMA
    ptu: {
      exentoHasta: () => UMA_2026 * 15
    }
  };

  let totalGravable = 0;
  let totalExento = 0;

  // Salario base siempre es gravable
  totalGravable += percepciones.salarioBase || 0;

  // Horas extra
  if (percepciones.horasExtra) {
    const exento = reglas.horasExtra.exentoHasta(percepciones.horasExtra);
    totalExento += exento;
    totalGravable += Math.max(0, percepciones.horasExtra - exento);
  }

  // Prima vacacional
  if (percepciones.primaVacacional) {
    const exento = Math.min(percepciones.primaVacacional, reglas.primaVacacional.exentoHasta());
    totalExento += exento;
    totalGravable += Math.max(0, percepciones.primaVacacional - exento);
  }

  // Aguinaldo
  if (percepciones.aguinaldo) {
    const exento = Math.min(percepciones.aguinaldo, reglas.aguinaldo.exentoHasta());
    totalExento += exento;
    totalGravable += Math.max(0, percepciones.aguinaldo - exento);
  }

  // Bonos (generalmente gravables al 100%)
  totalGravable += percepciones.bonoPuntualidad || 0;
  totalGravable += percepciones.bonoAsistencia || 0;
  totalGravable += percepciones.otrosBonos || 0;

  return {
    gravable: redondear(totalGravable),
    exento: redondear(totalExento),
    total: redondear(totalGravable + totalExento)
  };
}

/**
 * Calcula el Salario Diario Integrado (SDI) para efectos de IMSS
 * @param {number} salarioDiario - Salario diario base
 * @param {number} diasAguinaldo - Días de aguinaldo al año (mínimo 15)
 * @param {number} diasVacaciones - Días de vacaciones según antigüedad
 * @param {number} primaVacacionalPct - Porcentaje de prima vacacional (mínimo 25%)
 * @returns {number} - Salario Diario Integrado
 */
export function calcularSDI(salarioDiario, diasAguinaldo = 15, diasVacaciones = 12, primaVacacionalPct = 25) {
  // Fórmula SDI:
  // SDI = SD × (1 + (Aguinaldo/365) + ((Vacaciones × PrimaVac%) / 365))
  
  const factorAguinaldo = diasAguinaldo / 365;
  const factorVacaciones = (diasVacaciones * (primaVacacionalPct / 100)) / 365;
  const factorIntegracion = 1 + factorAguinaldo + factorVacaciones;
  
  return redondear(salarioDiario * factorIntegracion);
}

/**
 * Calcula las cuotas IMSS del trabajador
 * @param {number} sdi - Salario Diario Integrado
 * @param {number} diasCotizados - Días del período
 * @returns {Object} - Desglose de cuotas IMSS
 */
export function calcularCuotasIMSS(sdi, diasCotizados = 15) {
  const UMA_2026 = 113.14;
  const SMGDF_2026 = 278.80; // Salario mínimo zona libre
  
  // Topes y bases
  const topeIMSS = UMA_2026 * 25; // Tope de cotización
  const baseCalculo = Math.min(sdi, topeIMSS);
  const basePeriodo = baseCalculo * diasCotizados;
  
  // Cuotas obrero (las que se descuentan al trabajador)
  // Según Ley del Seguro Social
  const cuotas = {
    // Enfermedad y Maternidad - Prestaciones en especie
    enfermedadMaternidadEspecie: basePeriodo * 0.00375, // 0.375%
    
    // Invalidez y Vida
    invalidezVida: basePeriodo * 0.00625, // 0.625%
    
    // Cesantía en Edad Avanzada y Vejez
    cesantiaVejez: basePeriodo * 0.01125, // 1.125%
    
    // Guarderías - Solo patronal, no se descuenta
    guarderias: 0
  };
  
  const totalIMSS = cuotas.enfermedadMaternidadEspecie + 
                    cuotas.invalidezVida + 
                    cuotas.cesantiaVejez;
  
  return {
    desglose: {
      enfermedadMaternidadEspecie: redondear(cuotas.enfermedadMaternidadEspecie),
      invalidezVida: redondear(cuotas.invalidezVida),
      cesantiaVejez: redondear(cuotas.cesantiaVejez)
    },
    total: redondear(totalIMSS),
    baseCalculo,
    diasCotizados
  };
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Redondea a 2 decimales
 */
function redondear(valor) {
  return Math.round(valor * 100) / 100;
}

/**
 * Obtiene el valor de UMA vigente
 */
export async function obtenerUMA(anio = new Date().getFullYear()) {
  // Valores históricos de UMA (actualizar cada año)
  const valoresUMA = {
    2024: 108.57,
    2025: 110.00, // Estimado
    2026: 113.14  // Estimado
  };
  
  return valoresUMA[anio] || valoresUMA[2026];
}

/**
 * Calcula días de vacaciones según antigüedad (LFT Art. 76)
 */
export function diasVacacionesLFT(aniosAntiguedad) {
  if (aniosAntiguedad < 1) return 0;
  if (aniosAntiguedad === 1) return 12;
  if (aniosAntiguedad === 2) return 14;
  if (aniosAntiguedad === 3) return 16;
  if (aniosAntiguedad === 4) return 18;
  if (aniosAntiguedad === 5) return 20;
  // Después de 5 años, 2 días cada 5 años
  const quinquenios = Math.floor((aniosAntiguedad - 5) / 5);
  return 20 + (quinquenios * 2);
}

export default {
  calcularISR,
  calcularSubsidioEmpleo,
  separarPercepcionesGravables,
  calcularSDI,
  calcularCuotasIMSS,
  obtenerUMA,
  diasVacacionesLFT
};
