/**
 * Controlador de Aguinaldo
 * Cálculo según LFT México - Art. 87
 * Mínimo 15 días de salario, pagado antes del 20 de diciembre
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Días de aguinaldo según LFT (mínimo 15)
const DIAS_AGUINALDO_LFT = 15;

// Listar aguinaldos
export const index = async (req, res) => {
  try {
    const { anio, estado } = req.query;
    const anioActual = new Date().getFullYear();
    
    let where = {};
    
    if (anio) {
      where.Anio = parseInt(anio);
    } else {
      where.Anio = anioActual;
    }
    
    if (estado === 'pagado') {
      where.Pagado = true;
    } else if (estado === 'pendiente') {
      where.Pagado = false;
    }
    
    const aguinaldos = await prisma.aguinaldo.findMany({
      where,
      include: {
        empleado: {
          select: {
            ID_Empleado: true,
            Nombre: true,
            Apellido_Paterno: true,
            Apellido_Materno: true,
            Fecha_Ingreso: true,
            Salario_Diario: true
          }
        }
      },
      orderBy: { empleado: { Nombre: 'asc' } }
    });
    
    // Calcular totales
    const totales = {
      empleados: aguinaldos.length,
      bruto: aguinaldos.reduce((sum, a) => sum + Number(a.Monto_Bruto), 0),
      isr: aguinaldos.reduce((sum, a) => sum + Number(a.Deduccion_ISR), 0),
      neto: aguinaldos.reduce((sum, a) => sum + Number(a.Monto_Neto), 0),
      pagados: aguinaldos.filter(a => a.Pagado).length,
      pendientes: aguinaldos.filter(a => !a.Pagado).length
    };
    
    res.render('aguinaldo/index', {
      title: 'Aguinaldo',
      aguinaldos,
      totales,
      filtros: { anio: anio || anioActual, estado },
      anioActual
    });
  } catch (error) {
    console.error('Error al obtener aguinaldos:', error);
    req.flash('error', 'Error al cargar los aguinaldos');
    res.redirect('/');
  }
};

// Calcular aguinaldo para todos los empleados
export const calcular = async (req, res) => {
  try {
    const anioActual = new Date().getFullYear();
    const fechaCorte = new Date(anioActual, 11, 20); // 20 de diciembre
    
    // Obtener empleados activos
    const empleados = await prisma.empleados.findMany({
      where: { ID_Estatus: 1 },
      include: {
        aguinaldos: {
          where: { Anio: anioActual }
        }
      }
    });
    
    let calculados = 0;
    
    for (const empleado of empleados) {
      // Verificar si ya tiene aguinaldo este año
      if (empleado.aguinaldos.length > 0) continue;
      
      const fechaIngreso = new Date(empleado.Fecha_Ingreso);
      const salarioDiario = Number(empleado.Salario_Diario) || 0;
      
      if (salarioDiario === 0) continue;
      
      // Calcular días laborados en el año
      let diasLaborados = 365;
      
      // Si ingresó este año, calcular proporcional
      if (fechaIngreso.getFullYear() === anioActual) {
        const inicioAnio = new Date(anioActual, 0, 1);
        const fechaRef = fechaIngreso > inicioAnio ? fechaIngreso : inicioAnio;
        diasLaborados = Math.ceil((fechaCorte - fechaRef) / (1000 * 60 * 60 * 24));
      }
      
      // Calcular aguinaldo proporcional
      // Fórmula: (Salario diario × 15 días) / 365 × días laborados
      const aguinaldoProporcional = (salarioDiario * DIAS_AGUINALDO_LFT) / 365 * diasLaborados;
      const montoBruto = Math.round(aguinaldoProporcional * 100) / 100;
      
      // Calcular ISR (simplificado)
      // Aguinaldo exento: 30 UMAs = 30 × 108.57 = 3,257.10 aprox
      const umaActual = 108.57; // UMA 2024
      const exento = 30 * umaActual;
      const gravado = Math.max(0, montoBruto - exento);
      const isrEstimado = gravado * 0.30; // Tasa aproximada
      
      const montoNeto = montoBruto - isrEstimado;
      
      await prisma.aguinaldo.create({
        data: {
          ID_Empleado: empleado.ID_Empleado,
          Anio: anioActual,
          Fecha_Ingreso: fechaIngreso,
          Fecha_Corte: fechaCorte,
          Dias_Laborados: diasLaborados,
          Dias_Aguinaldo: DIAS_AGUINALDO_LFT,
          Salario_Diario: salarioDiario,
          Monto_Bruto: montoBruto,
          Deduccion_ISR: isrEstimado,
          Monto_Neto: montoNeto,
          Pagado: false,
          Calculado_Por: req.user?.ID_Usuario || null
        }
      });
      
      calculados++;
    }
    
    req.flash('success', `Aguinaldo calculado para ${calculados} empleado(s)`);
    res.redirect('/aguinaldo');
  } catch (error) {
    console.error('Error al calcular aguinaldo:', error);
    req.flash('error', 'Error al calcular el aguinaldo');
    res.redirect('/aguinaldo');
  }
};

// Marcar como pagado
export const pagar = async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.aguinaldo.update({
      where: { ID_Aguinaldo: parseInt(id) },
      data: {
        Pagado: true,
        Fecha_Pago: new Date()
      }
    });
    
    req.flash('success', 'Aguinaldo marcado como pagado');
    res.redirect('/aguinaldo');
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al registrar el pago');
    res.redirect('/aguinaldo');
  }
};

// Pagar todos
export const pagarTodos = async (req, res) => {
  try {
    const anioActual = new Date().getFullYear();
    
    await prisma.aguinaldo.updateMany({
      where: { 
        Anio: anioActual,
        Pagado: false
      },
      data: {
        Pagado: true,
        Fecha_Pago: new Date()
      }
    });
    
    req.flash('success', 'Todos los aguinaldos marcados como pagados');
    res.redirect('/aguinaldo');
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al registrar los pagos');
    res.redirect('/aguinaldo');
  }
};

// Ver detalle de un aguinaldo
export const ver = async (req, res) => {
  try {
    const { id } = req.params;
    
    const aguinaldo = await prisma.aguinaldo.findUnique({
      where: { ID_Aguinaldo: parseInt(id) },
      include: {
        empleado: {
          include: {
            puesto: true,
            area: true
          }
        }
      }
    });
    
    if (!aguinaldo) {
      req.flash('error', 'Registro no encontrado');
      return res.redirect('/aguinaldo');
    }
    
    res.render('aguinaldo/ver', {
      title: 'Detalle de Aguinaldo',
      aguinaldo
    });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al cargar el detalle');
    res.redirect('/aguinaldo');
  }
};
