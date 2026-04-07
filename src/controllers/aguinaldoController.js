/**
 * Controlador de Aguinaldo
 * Cálculo según LFT México - Art. 87
 * Mínimo 15 días de salario, pagado antes del 20 de diciembre
 *
 * PROPORCIONALIDAD (según indicaciones del contador):
 * - Faltas injustificadas descuentan de los días laborados
 * - Horas faltantes se acumulan: si un día trabajó 5 de 8 horas, faltaron 3
 *   Cuando las horas acumuladas llegan a una jornada completa = 1 falta equivalente
 * - Fórmula: (SD × 15) / 365 × Días_Efectivos
 *   Días_Efectivos = Días_Laborados - Faltas_Injustificadas - Faltas_Equivalentes
 */

import prisma from '../config/database.js';
import { getConfig } from '../services/nominaService.js';

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
    res.redirect('/?error=' + encodeURIComponent('Error al cargar los aguinaldos'));
  }
};

// Calcular aguinaldo para todos los empleados
export const calcular = async (req, res) => {
  try {
    const anioActual = new Date().getFullYear();
    const fechaCorte = new Date(anioActual, 11, 20); // 20 de diciembre
    const inicioAnio = new Date(anioActual, 0, 1);

    // Obtener configuración
    const diasAguinaldoConfig = await getConfig('DIAS_AGUINALDO', 15);
    const umaValor = await getConfig('UMA_DIARIO_2026', 113.14);
    const acumularHorasFaltantes = await getConfig('HORAS_FALTANTES_ACUMULAR', true);

    // Obtener tipos de incidencia que afectan aguinaldo
    const tiposQueAfectan = await prisma.cat_Tipo_Incidencia.findMany({
      where: { Afecta_Aguinaldo: true, Activo: true }
    });
    const idsQueAfectan = tiposQueAfectan.map(t => t.ID_Tipo_Incidencia);

    // Obtener empleados activos
    const empleados = await prisma.empleados.findMany({
      where: { ID_Estatus: 1 },
      include: {
        tipo_horario: true,
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
      const fechaRef = fechaIngreso.getFullYear() === anioActual
        ? (fechaIngreso > inicioAnio ? fechaIngreso : inicioAnio)
        : inicioAnio;

      if (fechaIngreso.getFullYear() === anioActual) {
        diasLaborados = Math.ceil((fechaCorte - fechaRef) / (1000 * 60 * 60 * 24));
      }

      // ========================================
      // CONTAR FALTAS QUE AFECTAN AGUINALDO
      // ========================================
      let faltasInjustificadas = 0;

      if (idsQueAfectan.length > 0) {
        const incidencias = await prisma.empleados_Incidencias.findMany({
          where: {
            ID_Empleado: empleado.ID_Empleado,
            ID_Tipo_Incidencia: { in: idsQueAfectan },
            Estado: 'APROBADO',
            Fecha_Inicio: {
              gte: fechaRef,
              lte: fechaCorte
            }
          }
        });

        faltasInjustificadas = incidencias.reduce((sum, inc) => sum + inc.Dias_Totales, 0);
      }

      // Sumar faltas de asistencia (días no presentes, no justificados)
      const faltasAsistencia = await prisma.empleados_Asistencia.count({
        where: {
          ID_Empleado: empleado.ID_Empleado,
          Fecha: {
            gte: fechaRef,
            lte: fechaCorte
          },
          Presente: false,
          Justificado: false
        }
      });

      faltasInjustificadas += faltasAsistencia;

      // ========================================
      // HORAS FALTANTES ACUMULADAS
      // Si un día trabajó 5 de 8 horas, faltan 3
      // Acumuladas y al llegar a 8 (jornada) = 1 falta equivalente
      // ========================================
      let horasFaltantes = 0;
      let faltasEquivalentes = 0;
      const horasJornada = empleado.tipo_horario?.Horas_Jornada || 8;

      if (acumularHorasFaltantes) {
        // Obtener registros de asistencia donde estuvo presente pero trabajó menos horas
        const asistencias = await prisma.empleados_Asistencia.findMany({
          where: {
            ID_Empleado: empleado.ID_Empleado,
            Fecha: {
              gte: fechaRef,
              lte: fechaCorte
            },
            Presente: true,
            Horas_Trabajadas: { not: null }
          },
          select: {
            Horas_Trabajadas: true,
            Fecha: true
          }
        });

        for (const asist of asistencias) {
          const horasTrabajadas = Number(asist.Horas_Trabajadas) || 0;
          // Determinar horas esperadas para ese día
          const diaSemana = new Date(asist.Fecha).getDay();
          let horasEsperadas = horasJornada;

          // Si es sábado, verificar horas de sábado
          if (diaSemana === 6) {
            const horasSabado = await getConfig('HORAS_SABADO', 4);
            horasEsperadas = horasSabado;
          }

          if (horasTrabajadas < horasEsperadas) {
            horasFaltantes += (horasEsperadas - horasTrabajadas);
          }
        }

        // Convertir horas faltantes a faltas equivalentes
        faltasEquivalentes = Math.floor(horasFaltantes / horasJornada);
      }

      // ========================================
      // CALCULAR DÍAS EFECTIVOS Y PROPORCIONALIDAD
      // ========================================
      const totalFaltas = faltasInjustificadas + faltasEquivalentes;
      const diasEfectivos = Math.max(0, diasLaborados - totalFaltas);
      const factorProporcionalidad = diasLaborados > 0 ? diasEfectivos / diasLaborados : 0;

      // Fórmula: (SD × Días_Aguinaldo) / 365 × Días_Efectivos
      const aguinaldoProporcional = (salarioDiario * diasAguinaldoConfig) / 365 * diasEfectivos;
      const montoBruto = redondear(aguinaldoProporcional);

      // Calcular ISR
      // Aguinaldo exento: 30 UMAs
      const exento = 30 * umaValor;
      const gravado = Math.max(0, montoBruto - exento);
      const isrEstimado = redondear(gravado * 0.30); // Tasa aproximada

      const montoNeto = redondear(montoBruto - isrEstimado);

      await prisma.aguinaldo.create({
        data: {
          ID_Empleado: empleado.ID_Empleado,
          Anio: anioActual,
          Fecha_Ingreso: fechaIngreso,
          Fecha_Corte: fechaCorte,
          Dias_Laborados: diasLaborados,
          Dias_Aguinaldo: diasAguinaldoConfig,
          Salario_Diario: salarioDiario,
          Monto_Bruto: montoBruto,
          Deduccion_ISR: isrEstimado,
          Monto_Neto: montoNeto,
          // Campos de proporcionalidad
          Faltas_Injustificadas: faltasInjustificadas,
          Horas_Faltantes: horasFaltantes,
          Faltas_Equivalentes: faltasEquivalentes,
          Dias_Efectivos: diasEfectivos,
          Factor_Proporcionalidad: factorProporcionalidad,
          Pagado: false,
          Calculado_Por: req.user?.ID_Usuario || null
        }
      });

      calculados++;
    }

    res.redirect('/aguinaldo?updated=1');
  } catch (error) {
    console.error('Error al calcular aguinaldo:', error);
    res.redirect('/aguinaldo?error=' + encodeURIComponent('Error al calcular el aguinaldo'));
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

    res.redirect('/aguinaldo?updated=1');
  } catch (error) {
    console.error('Error:', error);
    res.redirect('/aguinaldo?error=' + encodeURIComponent('Error al registrar el pago'));
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

    res.redirect('/aguinaldo?updated=1');
  } catch (error) {
    console.error('Error:', error);
    res.redirect('/aguinaldo?error=' + encodeURIComponent('Error al registrar los pagos'));
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
      return res.redirect('/aguinaldo?error=' + encodeURIComponent('Registro no encontrado'));
    }

    res.render('aguinaldo/ver', {
      title: 'Detalle de Aguinaldo',
      aguinaldo
    });
  } catch (error) {
    console.error('Error:', error);
    res.redirect('/aguinaldo?error=' + encodeURIComponent('Error al cargar el detalle'));
  }
};

// Eliminar un aguinaldo (solo si no está pagado)
export const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const aguinaldo = await prisma.aguinaldo.findUnique({
      where: { ID_Aguinaldo: parseInt(id) }
    });

    if (!aguinaldo) {
      return res.redirect('/aguinaldo?error=' + encodeURIComponent('Registro no encontrado'));
    }

    if (aguinaldo.Pagado) {
      return res.redirect(`/aguinaldo/${id}?error=` + encodeURIComponent('No se puede eliminar un aguinaldo ya pagado'));
    }

    await prisma.aguinaldo.delete({
      where: { ID_Aguinaldo: parseInt(id) }
    });

    res.redirect('/aguinaldo?deleted=1');
  } catch (error) {
    console.error('Error al eliminar:', error);
    res.redirect('/aguinaldo?error=' + encodeURIComponent('Error al eliminar'));
  }
};

// Eliminar todos los aguinaldos pendientes del año
export const eliminarTodos = async (req, res) => {
  try {
    const anioActual = new Date().getFullYear();

    const result = await prisma.aguinaldo.deleteMany({
      where: {
        Anio: anioActual,
        Pagado: false
      }
    });

    res.redirect('/aguinaldo?deleted=1');
  } catch (error) {
    console.error('Error al eliminar:', error);
    res.redirect('/aguinaldo?error=' + encodeURIComponent('Error al eliminar'));
  }
};

// Editar faltas y recalcular
export const editarFaltas = async (req, res) => {
  try {
    const { id } = req.params;
    const diasFaltas = parseInt(req.body.Dias_Faltas) || 0;

    const aguinaldo = await prisma.aguinaldo.findUnique({
      where: { ID_Aguinaldo: parseInt(id) }
    });

    if (!aguinaldo) {
      return res.redirect('/aguinaldo?error=' + encodeURIComponent('Registro no encontrado'));
    }

    const diasAguinaldoConfig = await getConfig('DIAS_AGUINALDO', 15);
    const umaValor = await getConfig('UMA_DIARIO_2026', 113.14);
    const salarioDiario = Number(aguinaldo.Salario_Diario);
    const diasLaborados = aguinaldo.Dias_Laborados;

    // Recalcular con las faltas manuales
    const diasEfectivos = Math.max(0, diasLaborados - diasFaltas);
    const factorProporcionalidad = diasLaborados > 0 ? diasEfectivos / diasLaborados : 0;
    const montoBruto = redondear((salarioDiario * diasAguinaldoConfig / 365) * diasEfectivos);

    // ISR
    const exento = 30 * umaValor;
    const gravado = Math.max(0, montoBruto - exento);
    const isrEstimado = redondear(gravado * 0.30);
    const montoNeto = redondear(montoBruto - isrEstimado);

    await prisma.aguinaldo.update({
      where: { ID_Aguinaldo: parseInt(id) },
      data: {
        Faltas_Injustificadas: diasFaltas,
        Horas_Faltantes: 0,
        Faltas_Equivalentes: 0,
        Dias_Efectivos: diasEfectivos,
        Factor_Proporcionalidad: factorProporcionalidad,
        Monto_Bruto: montoBruto,
        Deduccion_ISR: isrEstimado,
        Monto_Neto: montoNeto
      }
    });

    res.redirect(`/aguinaldo/${id}?updated=1`);
  } catch (error) {
    console.error('Error al editar faltas:', error);
    res.redirect('/aguinaldo?error=' + encodeURIComponent('Error al recalcular'));
  }
};

// Utilidad
function redondear(valor) {
  return Math.round(valor * 100) / 100;
}