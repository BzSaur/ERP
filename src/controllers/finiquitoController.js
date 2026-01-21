/**
 * Controlador de Finiquito y Liquidación
 * Cálculo según LFT México
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
    req.flash('error', 'Error al cargar los finiquitos');
    res.redirect('/');
  }
};

// Formulario para calcular finiquito
export const crear = async (req, res) => {
  try {
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
      empleados
    });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al cargar el formulario');
    res.redirect('/finiquito');
  }
};

// Calcular y guardar finiquito
export const calcular = async (req, res) => {
  try {
    const { ID_Empleado, Tipo, Fecha_Baja, Motivo_Baja } = req.body;
    
    const empleado = await prisma.empleados.findUnique({
      where: { ID_Empleado: parseInt(ID_Empleado) }
    });
    
    if (!empleado) {
      req.flash('error', 'Empleado no encontrado');
      return res.redirect('/finiquito/crear');
    }
    
    const fechaIngreso = new Date(empleado.Fecha_Ingreso);
    const fechaBaja = new Date(Fecha_Baja);
    const salarioDiario = Number(empleado.Salario_Diario) || 0;
    
    // Calcular antigüedad
    const diferenciaMs = fechaBaja - fechaIngreso;
    const diasTotales = Math.floor(diferenciaMs / (1000 * 60 * 60 * 24));
    const anosAntiguedad = Math.floor(diasTotales / 365);
    const mesesRestantes = Math.floor((diasTotales % 365) / 30);
    const diasRestantes = diasTotales % 30;
    
    // Salario Diario Integrado (SDI) para liquidación
    // SDI = Salario Diario + (Salario Diario × Factor de integración)
    // Factor aproximado: Aguinaldo (15/365) + Vacaciones (12/365) + Prima (0.25×12/365) = 0.0493
    const factorIntegracion = 1.0493;
    const salarioDiarioIntegrado = salarioDiario * factorIntegracion;
    
    // ========================================
    // CÁLCULOS DE FINIQUITO (siempre aplica)
    // ========================================
    
    // 1. Días trabajados del mes actual
    const inicioMes = new Date(fechaBaja.getFullYear(), fechaBaja.getMonth(), 1);
    const diasTrabajadosMes = Math.ceil((fechaBaja - inicioMes) / (1000 * 60 * 60 * 24)) + 1;
    const pagoDiasTrabajados = diasTrabajadosMes * salarioDiario;
    
    // 2. Vacaciones proporcionales (días según antigüedad)
    const diasVacaciones = calcularDiasVacaciones(anosAntiguedad);
    const diasMesActual = fechaBaja.getMonth() + 1;
    const vacacionesProporcionales = Math.round((diasVacaciones / 12) * diasMesActual);
    
    // 3. Prima vacacional (25% mínimo sobre salario de vacaciones)
    const primaVacacional = vacacionesProporcionales * salarioDiario * 0.25;
    
    // 4. Aguinaldo proporcional (15 días / 12 meses × meses trabajados)
    const mesesTrabajadosAnio = fechaBaja.getMonth() + 1;
    const aguinaldoProporcional = (15 / 12) * mesesTrabajadosAnio * salarioDiario;
    
    // ========================================
    // CÁLCULOS DE LIQUIDACIÓN (solo despido injustificado)
    // ========================================
    
    let indemnizacion90Dias = 0;
    let primaAntiguedad = 0;
    let salariosVencidos = 0;
    
    if (Tipo === 'LIQUIDACION') {
      // 1. Indemnización constitucional: 3 meses de salario (Art. 48 y 50 LFT)
      indemnizacion90Dias = 90 * salarioDiarioIntegrado;
      
      // 2. Prima de antigüedad: 12 días por año (Art. 162 LFT)
      // Tope: doble del salario mínimo × 12 días
      const salarioMinimo = 312.41; // 2024
      const topeSDIPrima = Math.min(salarioDiarioIntegrado, salarioMinimo * 2);
      primaAntiguedad = anosAntiguedad * 12 * topeSDIPrima;
      
      // 3. Salarios vencidos: solo si hay juicio laboral (no calculamos aquí)
      salariosVencidos = 0;
    }
    
    // ========================================
    // TOTALES
    // ========================================
    
    const totalBruto = pagoDiasTrabajados + (vacacionesProporcionales * salarioDiario) + 
                       primaVacacional + aguinaldoProporcional + 
                       indemnizacion90Dias + primaAntiguedad + salariosVencidos;
    
    // ISR (simplificado - en realidad es más complejo)
    const isrEstimado = totalBruto * 0.25; // Tasa aproximada
    
    const totalNeto = totalBruto - isrEstimado;
    
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
    
    req.flash('success', `${Tipo === 'FINIQUITO' ? 'Finiquito' : 'Liquidación'} calculado exitosamente`);
    res.redirect(`/finiquito/${finiquito.ID_Finiquito}`);
  } catch (error) {
    console.error('Error al calcular finiquito:', error);
    req.flash('error', 'Error al calcular el finiquito');
    res.redirect('/finiquito/crear');
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
      req.flash('error', 'Registro no encontrado');
      return res.redirect('/finiquito');
    }
    
    res.render('finiquito/ver', {
      title: `${finiquito.Tipo === 'FINIQUITO' ? 'Finiquito' : 'Liquidación'}`,
      finiquito
    });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al cargar el detalle');
    res.redirect('/finiquito');
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
    
    req.flash('success', 'Finiquito aprobado');
    res.redirect(`/finiquito/${id}`);
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al aprobar');
    res.redirect('/finiquito');
  }
};

// Pagar finiquito
export const pagar = async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.finiquito_Liquidacion.update({
      where: { ID_Finiquito: parseInt(id) },
      data: {
        Estado: 'PAGADO',
        Pagado: true,
        Fecha_Pago: new Date()
      }
    });
    
    req.flash('success', 'Finiquito pagado');
    res.redirect(`/finiquito/${id}`);
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al registrar pago');
    res.redirect('/finiquito');
  }
};

// Función auxiliar para calcular días de vacaciones
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
