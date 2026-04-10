/**
 * Controlador de Finiquito y Liquidación
 * Cálculo según LFT México
 *
 * TERMINOLOGÍA:
 * - FINIQUITO: Despido injustificado = partes proporcionales + Indemnización 90 días + Prima de antigüedad
 * - LIQUIDACION: Renuncia voluntaria / despido justificado = solo partes proporcionales
 *
 * SDI DINÁMICO:
 * SDI = SD × (1 + 15/365 + DiasVacaciones×0.25/365)
 * El factor varía según antigüedad porque los días de vacaciones cambian
 *
 * PRIMA DE ANTIGÜEDAD:
 * SDI × 12 × Años de trabajo
 * Tope mínimo: 1 salario mínimo diario × 12
 * Tope máximo: 2 salarios mínimos diarios × 12
 */

import prisma from '../config/database.js';
import { getConfig } from '../services/nominaService.js';

// Listar finiquitos
export const index = async (req, res) => {
  try {
    const { tipo, estado } = req.query;

    let where = {};

    if (tipo) {
      where.Tipo = tipo;
    }

    if (estado) {
      where.Estado = estado;
    }

    const finiquitos = await prisma.finiquito_Liquidacion.findMany({
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
      orderBy: { Fecha_Baja: 'desc' },
      take: 100
    });

    // Estadísticas
    const stats = {
      finiquitos: await prisma.finiquito_Liquidacion.count({ where: { Tipo: 'FINIQUITO' } }),
      liquidaciones: await prisma.finiquito_Liquidacion.count({ where: { Tipo: 'LIQUIDACION' } }),
      pendientes: await prisma.finiquito_Liquidacion.count({ where: { Estado: 'CALCULADO' } }),
      pagados: await prisma.finiquito_Liquidacion.count({ where: { Pagado: true } })
    };

    res.render('finiquito/index', {
      title: 'Finiquito y Liquidación',
      finiquitos,
      stats,
      filtros: { tipo, estado }
    });
  } catch (error) {
    console.error('Error al obtener finiquitos:', error);
    res.redirect('/?error=' + encodeURIComponent('Error al cargar los finiquitos'));
  }
};

// Formulario para calcular finiquito
export const crear = async (req, res) => {
  try {
    const empleadoSeleccionado = parseInt(req.query.empleado, 10) || null;

    // Empleados activos (para calcular su baja)
    const empleados = await prisma.empleados.findMany({
      where: { ID_Estatus: 1 },
      include: {
        puesto: true,
        area: true
      },
      orderBy: { Nombre: 'asc' }
    });

    res.render('finiquito/crear', {
      title: 'Calcular Finiquito/Liquidación',
      empleados,
      empleadoSeleccionado
    });
  } catch (error) {
    console.error('Error:', error);
    res.redirect('/finiquito?error=' + encodeURIComponent('Error al cargar el formulario'));
  }
};

// Calcular y guardar finiquito
export const calcular = async (req, res) => {
  try {
    const { ID_Empleado, Tipo, Fecha_Baja, Motivo_Baja, Dias_Faltas } = req.body;
    const diasFaltas = parseInt(Dias_Faltas) || 0;

    const empleado = await prisma.empleados.findUnique({
      where: { ID_Empleado: parseInt(ID_Empleado) },
      include: { tipo_horario: true }
    });

    if (!empleado) {
      return res.redirect('/finiquito/crear?error=' + encodeURIComponent('Empleado no encontrado'));
    }

    const fechaIngreso = new Date(empleado.Fecha_Ingreso);
    const fechaBaja = new Date(Fecha_Baja);
    const salarioDiario = Number(empleado.Salario_Diario) || 0;

    // Obtener salario mínimo de configuración
    const salarioMinimo = await getConfig('SALARIO_MINIMO_2026', 278.80);
    const diasAguinaldoConfig = await getConfig('DIAS_AGUINALDO', 15);
    const primaVacacionalPct = (await getConfig('PRIMA_VACACIONAL_PCT', 25)) / 100;

    // Calcular antigüedad
    const diferenciaMs = fechaBaja - fechaIngreso;
    const diasTotales = Math.floor(diferenciaMs / (1000 * 60 * 60 * 24));
    const anosAntiguedad = Math.floor(diasTotales / 365);
    const mesesRestantes = Math.floor((diasTotales % 365) / 30);
    const diasRestantes = diasTotales % 30;

    // ========================================
    // SDI DINÁMICO (varía según antigüedad)
    // SDI = SD × (1 + Aguinaldo/365 + DiasVac×PrimaVac/365)
    // ========================================
    const diasVacacionesSDI = calcularDiasVacaciones(anosAntiguedad);
    const factorIntegracion = 1 + (diasAguinaldoConfig / 365) + (diasVacacionesSDI * primaVacacionalPct / 365);
    const salarioDiarioIntegrado = redondear(salarioDiario * factorIntegracion);

    // ========================================
    // CÁLCULOS DE FINIQUITO (siempre aplica)
    // ========================================

    // 1. Días trabajados del mes actual
    const inicioMes = new Date(fechaBaja.getFullYear(), fechaBaja.getMonth(), 1);
    const diasTrabajadosMes = Math.ceil((fechaBaja - inicioMes) / (1000 * 60 * 60 * 24)) + 1;
    const pagoDiasTrabajados = redondear(diasTrabajadosMes * salarioDiario);

    // 2. Vacaciones proporcionales (días según antigüedad)
    const diasVacaciones = calcularDiasVacaciones(anosAntiguedad);
    const diasMesActual = fechaBaja.getMonth() + 1;
    const vacacionesProporcionales = Math.round((diasVacaciones / 12) * diasMesActual);

    // 3. Prima vacacional (25% mínimo sobre salario de vacaciones)
    const primaVacacional = redondear(vacacionesProporcionales * salarioDiario * primaVacacionalPct);

    // 4. Aguinaldo proporcional con proporcionalidad por faltas
    // Fórmula: (SD × DiasAguinaldo / 365) × DiasEfectivos
    const inicioAnio = new Date(fechaBaja.getFullYear(), 0, 1);
    const fechaRefAguinaldo = fechaIngreso > inicioAnio ? fechaIngreso : inicioAnio;
    const diasLaboradosAnio = Math.ceil((fechaBaja - fechaRefAguinaldo) / (1000 * 60 * 60 * 24)) + 1;
    const diasEfectivos = Math.max(0, diasLaboradosAnio - diasFaltas);
    const aguinaldoProporcional = redondear((salarioDiario * diasAguinaldoConfig / 365) * diasEfectivos);

    // ========================================
    // CÁLCULOS EXTRA FINIQUITO (despido injustificado)
    // Finiquito = partes proporcionales + Indemnización + Prima de antigüedad
    // ========================================

    let indemnizacion90Dias = 0;
    let primaAntiguedad = 0;
    let salariosVencidos = 0;

    if (Tipo === 'FINIQUITO') {
      // 1. Indemnización constitucional: 3 meses de salario integrado (Art. 48 y 50 LFT)
      // Indemnización = SDI × 90 días
      indemnizacion90Dias = redondear(90 * salarioDiarioIntegrado);

      // 2. Prima de antigüedad: 12 días por año (Art. 162 LFT)
      // SDI × 12 × Años de trabajo
      // Tope: el SDI usado para prima NO puede ser menor a 1 SM ni mayor a 2 SM
      const sdiParaPrima = Math.max(salarioMinimo, Math.min(salarioDiarioIntegrado, salarioMinimo * 2));
      primaAntiguedad = redondear(anosAntiguedad * 12 * sdiParaPrima);

      // 3. Salarios vencidos: solo si hay juicio laboral (no calculamos aquí)
      salariosVencidos = 0;
    }

    // ========================================
    // TOTALES
    // ========================================

    const totalBruto = redondear(
      pagoDiasTrabajados + (vacacionesProporcionales * salarioDiario) +
      primaVacacional + aguinaldoProporcional +
      indemnizacion90Dias + primaAntiguedad + salariosVencidos
    );

    // ISR (simplificado - en realidad es más complejo, se implementará después)
    const isrEstimado = redondear(totalBruto * 0.25);

    const totalNeto = redondear(totalBruto - isrEstimado);

    // Guardar
    const finiquito = await prisma.finiquito_Liquidacion.create({
      data: {
        ID_Empleado: parseInt(ID_Empleado),
        Tipo,
        Fecha_Baja: fechaBaja,
        Motivo_Baja,
        Fecha_Ingreso: fechaIngreso,
        Antiguedad_Anos: anosAntiguedad,
        Antiguedad_Meses: mesesRestantes,
        Antiguedad_Dias: diasRestantes,
        Salario_Diario: salarioDiario,
        Salario_Diario_Integrado: salarioDiarioIntegrado,
        Dias_Faltas: diasFaltas,
        Dias_Trabajados_Pendientes: diasTrabajadosMes,
        Pago_Dias_Trabajados: pagoDiasTrabajados,
        Vacaciones_Pendientes: vacacionesProporcionales,
        Prima_Vacacional: primaVacacional,
        Aguinaldo_Proporcional: aguinaldoProporcional,
        Indemnizacion_90_Dias: indemnizacion90Dias,
        Prima_Antiguedad: primaAntiguedad,
        Salarios_Vencidos: salariosVencidos,
        Total_Bruto: totalBruto,
        Deduccion_ISR: isrEstimado,
        Otras_Deducciones: 0,
        Total_Neto: totalNeto,
        Estado: 'CALCULADO',
        CreatedBy: req.session.user?.Email_Office365 || null
      }
    });

    res.redirect(`/finiquito/${finiquito.ID_Finiquito}?created=1`);
  } catch (error) {
    console.error('Error al calcular finiquito:', error);
    res.redirect('/finiquito/crear?error=' + encodeURIComponent('Error al calcular el finiquito'));
  }
};

// Ver detalle
export const ver = async (req, res) => {
  try {
    const { id } = req.params;

    const finiquito = await prisma.finiquito_Liquidacion.findUnique({
      where: { ID_Finiquito: parseInt(id) },
      include: {
        empleado: {
          include: {
            puesto: true,
            area: true
          }
        }
      }
    });

    if (!finiquito) {
      return res.redirect('/finiquito?error=' + encodeURIComponent('Registro no encontrado'));
    }

    res.render('finiquito/ver', {
      title: `${finiquito.Tipo === 'FINIQUITO' ? 'Finiquito' : 'Liquidación'}`,
      finiquito
    });
  } catch (error) {
    console.error('Error:', error);
    res.redirect('/finiquito?error=' + encodeURIComponent('Error al cargar el detalle'));
  }
};

// Aprobar finiquito
export const aprobar = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.finiquito_Liquidacion.update({
      where: { ID_Finiquito: parseInt(id) },
      data: {
        Estado: 'APROBADO',
        Aprobado_Por: req.user?.ID_Usuario || null,
        Fecha_Aprobacion: new Date()
      }
    });

    res.redirect(`/finiquito/${id}?updated=1`);
  } catch (error) {
    console.error('Error:', error);
    res.redirect('/finiquito?error=' + encodeURIComponent('Error al aprobar'));
  }
};

// Pagar finiquito y dar de baja al empleado
export const pagar = async (req, res) => {
  try {
    const { id } = req.params;

    const finiquito = await prisma.finiquito_Liquidacion.update({
      where: { ID_Finiquito: parseInt(id) },
      data: {
        Estado: 'PAGADO',
        Pagado: true,
        Fecha_Pago: new Date()
      }
    });

    // Marcar al empleado como BAJA (ID_Estatus = 2)
    await prisma.empleados.update({
      where: { ID_Empleado: finiquito.ID_Empleado },
      data: {
        ID_Estatus: 2, // BAJA
        Fecha_Baja: finiquito.Fecha_Baja
      }
    });

    res.redirect(`/finiquito/${id}?updated=1`);
  } catch (error) {
    console.error('Error:', error);
    res.redirect('/finiquito?error=' + encodeURIComponent('Error al registrar pago'));
  }
};

// Eliminar finiquito (solo si no está pagado)
export const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const finiquito = await prisma.finiquito_Liquidacion.findUnique({
      where: { ID_Finiquito: parseInt(id) }
    });

    if (!finiquito) {
      return res.redirect('/finiquito?error=' + encodeURIComponent('Registro no encontrado'));
    }

    if (finiquito.Pagado) {
      return res.redirect(`/finiquito/${id}?error=` + encodeURIComponent('No se puede eliminar un finiquito ya pagado'));
    }

    await prisma.finiquito_Liquidacion.delete({
      where: { ID_Finiquito: parseInt(id) }
    });

    res.redirect('/finiquito?deleted=1');
  } catch (error) {
    console.error('Error al eliminar:', error);
    res.redirect('/finiquito?error=' + encodeURIComponent('Error al eliminar el registro'));
  }
};

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

/**
 * Calcula días de vacaciones según LFT reformada 2023
 */
function calcularDiasVacaciones(anosAntiguedad) {
  if (anosAntiguedad <= 0) return 0;
  if (anosAntiguedad === 1) return 12;
  if (anosAntiguedad === 2) return 14;
  if (anosAntiguedad === 3) return 16;
  if (anosAntiguedad === 4) return 18;
  if (anosAntiguedad === 5) return 20;
  if (anosAntiguedad <= 10) return 22;
  if (anosAntiguedad <= 15) return 24;
  if (anosAntiguedad <= 20) return 26;
  if (anosAntiguedad <= 25) return 28;
  if (anosAntiguedad <= 30) return 30;
  return 32;
}

/**
 * Redondea a 2 decimales
 */
function redondear(valor) {
  return Math.round(valor * 100) / 100;
}

/**
 * Calcula el SDI dinámico según antigüedad
 * SDI = SD × (1 + DiasAguinaldo/365 + DiasVacaciones×PrimaVacacional/365)
 * Exportado para uso en otros módulos
 */
export function calcularSDI(salarioDiario, anosAntiguedad, diasAguinaldo = 15, primaVacacionalPct = 0.25) {
  const diasVacaciones = calcularDiasVacaciones(anosAntiguedad);
  const factorIntegracion = 1 + (diasAguinaldo / 365) + (diasVacaciones * primaVacacionalPct / 365);
  return {
    sdi: redondear(salarioDiario * factorIntegracion),
    factor: factorIntegracion,
    diasVacaciones
  };
}