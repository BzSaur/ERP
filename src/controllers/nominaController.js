/**
 * Controlador de Nómina
 * Gestión de periodos de nómina y cálculo de sueldos
 */

import prisma from '../config/database.js';
import { getConfig, getConfigMultiple, calcularNominaSemanal } from '../services/nominaService.js';

// ============================================================
// PERIODOS DE NÓMINA
// ============================================================

// Listar periodos de nómina
export const periodos = async (req, res) => {
  try {
    const { anio, estado } = req.query;
    
    let where = {};
    
    if (anio) {
      const year = parseInt(anio);
      where.Fecha_Inicio = {
        gte: new Date(year, 0, 1),
        lt: new Date(year + 1, 0, 1)
      };
    }
    
    if (estado) {
      where.Estado = estado;
    }
    
    const periodos = await prisma.periodos_Nomina.findMany({
      where,
      orderBy: { Fecha_Inicio: 'desc' },
      take: 50
    });
    
    // Estadísticas
    const stats = {
      pendientes: await prisma.periodos_Nomina.count({ where: { Estado: 'PENDIENTE' } }),
      procesando: await prisma.periodos_Nomina.count({ where: { Estado: 'PROCESANDO' } }),
      cerrados: await prisma.periodos_Nomina.count({ where: { Estado: 'CERRADO' } })
    };
    
    res.render('nomina/periodos/index', {
      title: 'Periodos de Nómina',
      periodos,
      stats,
      filtros: { anio, estado }
    });
  } catch (error) {
    console.error('Error al obtener periodos:', error);
    req.flash('error', 'Error al cargar los periodos de nómina');
    res.redirect('/');
  }
};

// Formulario crear periodo
export const crearPeriodo = async (req, res) => {
  res.render('nomina/periodos/crear', {
    title: 'Nuevo Periodo de Nómina'
  });
};

// Guardar nuevo periodo
export const storePeriodo = async (req, res) => {
  try {
    const { Nombre_Periodo, Tipo_Periodo, Fecha_Inicio, Fecha_Fin, Fecha_Pago, Observaciones } = req.body;
    
    const fechaInicio = new Date(Fecha_Inicio);
    const fechaFin = new Date(Fecha_Fin);
    const diasPeriodo = Math.ceil((fechaFin - fechaInicio) / (1000 * 60 * 60 * 24)) + 1;
    
    await prisma.periodos_Nomina.create({
      data: {
        Nombre_Periodo,
        Tipo_Periodo,
        Fecha_Inicio: fechaInicio,
        Fecha_Fin: fechaFin,
        Fecha_Pago: new Date(Fecha_Pago),
        Dias_Periodo: diasPeriodo,
        Estado: 'PENDIENTE',
        Observaciones: Observaciones || null,
        CreatedBy: req.session.user?.Email_Office365 || null
      }
    });
    
    req.flash('success', 'Periodo de nómina creado exitosamente');
    res.redirect('/nomina/periodos');
  } catch (error) {
    console.error('Error al crear periodo:', error);
    if (error.code === 'P2002') {
      req.flash('error', 'Ya existe un periodo con esas fechas de inicio y fin. Usa fechas diferentes.');
    } else {
      req.flash('error', 'Error al crear el periodo de nómina');
    }
    res.redirect('/nomina/periodos/crear');
  }
};

// ============================================================
// CÁLCULO DE NÓMINA
// ============================================================

// Ver detalle de un periodo y sus nóminas
export const verPeriodo = async (req, res) => {
  try {
    const { id } = req.params;
    
    const periodo = await prisma.periodos_Nomina.findUnique({
      where: { ID_Periodo: parseInt(id) },
      include: {
        nominas: {
          include: {
            empleado: {
              select: {
                ID_Empleado: true,
                Nombre: true,
                Apellido_Paterno: true,
                Apellido_Materno: true,
                Salario_Diario: true,
                Salario_Hora: true
              }
            }
          },
          orderBy: { empleado: { Nombre: 'asc' } }
        }
      }
    });
    
    if (!periodo) {
      req.flash('error', 'Periodo no encontrado');
      return res.redirect('/nomina/periodos');
    }
    
    // Calcular totales del periodo
    const totales = {
      percepciones: periodo.nominas.reduce((sum, n) => sum + Number(n.Total_Percepciones), 0),
      deducciones: periodo.nominas.reduce((sum, n) => sum + Number(n.Total_Deducciones), 0),
      neto: periodo.nominas.reduce((sum, n) => sum + Number(n.Sueldo_Neto), 0),
      netoRedondeado: periodo.nominas.reduce((sum, n) => sum + Number(n.Sueldo_Neto) + Number(n.Otros_Bonos || 0), 0),
      empleados: periodo.nominas.length
    };
    
    res.render('nomina/periodos/ver', {
      title: `Nómina: ${periodo.Nombre_Periodo}`,
      periodo,
      totales
    });
  } catch (error) {
    console.error('Error al ver periodo:', error);
    req.flash('error', 'Error al cargar el periodo');
    res.redirect('/nomina/periodos');
  }
};

// Calcular nómina para todos los empleados activos
export const calcularNomina = async (req, res) => {
  try {
    const { id } = req.params;
    
    const periodo = await prisma.periodos_Nomina.findUnique({
      where: { ID_Periodo: parseInt(id) }
    });
    
    if (!periodo) {
      req.flash('error', 'Periodo no encontrado');
      return res.redirect('/nomina/periodos');
    }
    
    if (periodo.Estado === 'CERRADO') {
      req.flash('error', 'No se puede calcular un periodo cerrado');
      return res.redirect(`/nomina/periodos/${id}`);
    }
    
    // Obtener configuración de deducciones desde SuperAdmin
    const config = await getConfigMultiple([
      'CALCULAR_IMSS',
      'CALCULAR_ISR',
      'TASA_IMSS_EMPLEADO',
      'TASA_ISR',
      'PRESTAMOS_ACTIVO',
      'PRESTAMOS_TASA_INTERES'
    ]);
    
    // Obtener empleados activos con sus datos de la semana
    const empleados = await prisma.empleados.findMany({
      where: { ID_Estatus: 1 },
      include: {
        horas_adicionales: {
          where: {
            Fecha: {
              gte: periodo.Fecha_Inicio,
              lte: periodo.Fecha_Fin
            },
            Aprobado: true
          }
        },
        asistencia: {
          where: {
            Fecha: {
              gte: periodo.Fecha_Inicio,
              lte: periodo.Fecha_Fin
            }
          }
        },
        prestamos: {
          where: { Estado: 'ACTIVO' }
        },
        puesto: {
          select: {
            Salario_Base_Referencia: true,
            Salario_Hora_Referencia: true
          }
        }
      }
    });
    
    // Actualizar estado del periodo
    await prisma.periodos_Nomina.update({
      where: { ID_Periodo: parseInt(id) },
      data: { Estado: 'PROCESANDO' }
    });
    
    let nominasCreadas = 0;
    const diasLaborables = 6; // L-S
    
    for (const empleado of empleados) {
      // Calcular días trabajados (sin contar domingos)
      const asistenciasSinDomingo = empleado.asistencia.filter(a => {
        const fecha = new Date(a.Fecha);
        return fecha.getDay() !== 0; // Excluir domingos
      });
      const diasTrabajados = asistenciasSinDomingo.filter(a => a.Presente).length || periodo.Dias_Periodo;
      const diasFaltas = asistenciasSinDomingo.filter(a => !a.Presente && !a.Justificado).length;
      
      // Calcular horas adicionales (todos los tipos que generan pago extra)
      const horasExtra = empleado.horas_adicionales
        .filter(h => h.Tipo_Hora === 'EXTRA')
        .reduce((sum, h) => sum + Number(h.Cantidad_Horas), 0);
      const horasDobles = empleado.horas_adicionales
        .filter(h => h.Tipo_Hora === 'DOBLE')
        .reduce((sum, h) => sum + Number(h.Cantidad_Horas), 0);
      const horasTriples = empleado.horas_adicionales
        .filter(h => h.Tipo_Hora === 'TRIPLE')
        .reduce((sum, h) => sum + Number(h.Cantidad_Horas), 0);
      
      // Horas presenciales y en línea también cuentan como extra dobles
      const horasPresencialRemoto = empleado.horas_adicionales
        .filter(h => h.Tipo_Hora === 'PRESENCIAL' || h.Tipo_Hora === 'EN_LINEA')
        .reduce((sum, h) => sum + Number(h.Cantidad_Horas), 0);
      
      // Total horas dobles = DOBLE + PRESENCIAL + EN_LINEA + EXTRA (todas pagan doble)
      const totalHorasDobles = horasDobles + horasPresencialRemoto + horasExtra;
      const totalHorasTriples = horasTriples;
      
      // Salarios base (LFT) — fuente de verdad: Salario_Mensual > puesto.Salario_Base_Referencia
      const salarioMensual = Number(empleado.Salario_Mensual) 
        || Number(empleado.puesto?.Salario_Base_Referencia) 
        || (Number(empleado.Salario_Diario) * 30) 
        || 0;
      const salarioDiario = redondear(salarioMensual / 30);
      const salarioHora = redondear(salarioDiario / 8);
      
      // ============================================================
      // PERCEPCIONES — Salario semanal = diario × 7 (LFT Art. 69/72)
      // ============================================================
      let salarioBase;
      let pagoDomingoLFT = 0;
      const diasEfectivos = Math.max(0, diasTrabajados - diasFaltas);
      
      if (diasFaltas === 0 && diasEfectivos >= diasLaborables) {
        // Semana completa: 7 días (6 laborales + domingo descanso)
        salarioBase = redondear(salarioDiario * 7);
        pagoDomingoLFT = salarioDiario;
      } else {
        // Con faltas: pago proporcional + domingo proporcional (LFT Art. 72)
        salarioBase = redondear(salarioDiario * diasEfectivos);
        pagoDomingoLFT = redondear(salarioDiario * (diasEfectivos / diasLaborables));
        salarioBase = redondear(salarioBase + pagoDomingoLFT);
      }
      
      // Horas extra
      const pagoHorasDobles = redondear(totalHorasDobles * salarioHora * 2);
      const pagoHorasTriples = redondear(totalHorasTriples * salarioHora * 3);
      
      const totalPercepciones = redondear(salarioBase + pagoHorasDobles + pagoHorasTriples);
      
      // ============================================================
      // DEDUCCIONES — Controladas por SuperAdmin
      // ============================================================
      const tasaIMSS = config.TASA_IMSS_EMPLEADO || 2.475;
      const tasaISR = config.TASA_ISR || 0;
      const tasaInteres = config.PRESTAMOS_TASA_INTERES || 0;
      
      // IMSS: solo si SuperAdmin lo activó
      const deduccionIMSS = (config.CALCULAR_IMSS === true)
        ? redondear(totalPercepciones * (tasaIMSS / 100))
        : 0;
      
      // ISR: solo si SuperAdmin lo activó
      const deduccionISR = (config.CALCULAR_ISR === true)
        ? redondear(totalPercepciones * (tasaISR / 100))
        : 0;
      
      // Préstamos: descuento semanal + interés
      let deduccionPrestamo = 0;
      if (config.PRESTAMOS_ACTIVO === true && empleado.prestamos.length > 0) {
        const prestamoActivo = empleado.prestamos[0];
        deduccionPrestamo = Number(prestamoActivo.Monto_Por_Pago);
        
        // Interés semanal sobre saldo pendiente
        if (tasaInteres > 0) {
          const interesSemanal = redondear(
            Number(prestamoActivo.Monto_Pendiente) * (tasaInteres / 100) / 52
          );
          deduccionPrestamo = redondear(deduccionPrestamo + interesSemanal);
        }
      }
      
      const totalDeducciones = redondear(deduccionIMSS + deduccionISR + deduccionPrestamo);
      const sueldoNeto = redondear(totalPercepciones - totalDeducciones);
      
      // ============================================================
      // REDONDEO — Nómina redondeada al siguiente múltiplo de $10
      // ============================================================
      const sueldoRedondeado = Math.ceil(sueldoNeto / 10) * 10;
      const ajusteRedondeo = redondear(sueldoRedondeado - sueldoNeto);
      
      // Total horas extra para registro (EXTRA + PRESENCIAL + EN_LINEA)
      const totalHorasExtraRegistro = horasExtra + horasPresencialRemoto;
      
      // Crear o actualizar nómina
      await prisma.nomina.upsert({
        where: {
          ID_Periodo_ID_Empleado: {
            ID_Periodo: periodo.ID_Periodo,
            ID_Empleado: empleado.ID_Empleado
          }
        },
        create: {
          ID_Periodo: periodo.ID_Periodo,
          ID_Empleado: empleado.ID_Empleado,
          Dias_Trabajados: diasTrabajados,
          Dias_Faltas: diasFaltas,
          Horas_Normales: diasEfectivos * 8,
          Horas_Extra: totalHorasExtraRegistro,
          Horas_Dobles: totalHorasDobles,
          Horas_Triples: totalHorasTriples,
          Salario_Base: salarioBase,
          Pago_Horas_Extra: 0,
          Pago_Horas_Dobles: pagoHorasDobles,
          Pago_Horas_Triples: pagoHorasTriples,
          Total_Percepciones: totalPercepciones,
          Deduccion_IMSS: deduccionIMSS,
          Deduccion_ISR: deduccionISR,
          Otras_Deducciones: deduccionPrestamo,
          Total_Deducciones: totalDeducciones,
          Sueldo_Neto: sueldoNeto,
          Otros_Bonos: ajusteRedondeo,
          Estado: 'CALCULADO',
          CreatedBy: req.session.user?.Email_Office365 || null
        },
        update: {
          Dias_Trabajados: diasTrabajados,
          Dias_Faltas: diasFaltas,
          Horas_Normales: diasEfectivos * 8,
          Horas_Extra: totalHorasExtraRegistro,
          Horas_Dobles: totalHorasDobles,
          Horas_Triples: totalHorasTriples,
          Salario_Base: salarioBase,
          Pago_Horas_Extra: 0,
          Pago_Horas_Dobles: pagoHorasDobles,
          Pago_Horas_Triples: pagoHorasTriples,
          Total_Percepciones: totalPercepciones,
          Deduccion_IMSS: deduccionIMSS,
          Deduccion_ISR: deduccionISR,
          Otras_Deducciones: deduccionPrestamo,
          Total_Deducciones: totalDeducciones,
          Sueldo_Neto: sueldoNeto,
          Otros_Bonos: ajusteRedondeo,
          Estado: 'CALCULADO'
        }
      });
      
      // Si tiene préstamo, actualizar pagos realizados
      if (deduccionPrestamo > 0 && empleado.prestamos.length > 0) {
        const prestamo = empleado.prestamos[0];
        const nuevoSaldo = redondear(Number(prestamo.Monto_Pendiente) - Number(prestamo.Monto_Por_Pago));
        
        await prisma.empleados_Prestamos.update({
          where: { ID_Prestamo: prestamo.ID_Prestamo },
          data: {
            Pagos_Realizados: { increment: 1 },
            Monto_Pendiente: Math.max(0, nuevoSaldo),
            Estado: nuevoSaldo <= 0 ? 'PAGADO' : 'ACTIVO'
          }
        });
      }
      
      nominasCreadas++;
    }
    
    req.flash('success', `Nómina calculada para ${nominasCreadas} empleado(s)`);
    res.redirect(`/nomina/periodos/${id}`);
  } catch (error) {
    console.error('Error al calcular nómina:', error);
    req.flash('error', 'Error al calcular la nómina');
    res.redirect('/nomina/periodos');
  }
};

/**
 * Redondea a 2 decimales
 */
function redondear(valor) {
  return Math.round(valor * 100) / 100;
}

// Cerrar periodo
export const cerrarPeriodo = async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.periodos_Nomina.update({
      where: { ID_Periodo: parseInt(id) },
      data: {
        Estado: 'CERRADO',
        Cerrado_Por: req.user.ID_Usuario,
        Fecha_Cierre: new Date()
      }
    });
    
    // Marcar todas las nóminas como aprobadas
    await prisma.nomina.updateMany({
      where: { ID_Periodo: parseInt(id) },
      data: {
        Estado: 'APROBADO',
        Aprobado_Por: req.user.ID_Usuario,
        Fecha_Aprobacion: new Date()
      }
    });
    
    req.flash('success', 'Periodo cerrado exitosamente');
    res.redirect(`/nomina/periodos/${id}`);
  } catch (error) {
    console.error('Error al cerrar periodo:', error);
    req.flash('error', 'Error al cerrar el periodo');
    res.redirect('/nomina/periodos');
  }
};

// Ver detalle de nómina de un empleado
export const verNominaEmpleado = async (req, res) => {
  try {
    const { periodoId, empleadoId } = req.params;
    
    const nomina = await prisma.nomina.findUnique({
      where: {
        ID_Periodo_ID_Empleado: {
          ID_Periodo: parseInt(periodoId),
          ID_Empleado: parseInt(empleadoId)
        }
      },
      include: {
        periodo: true,
        empleado: {
          include: {
            puesto: true,
            area: true
          }
        }
      }
    });
    
    if (!nomina) {
      req.flash('error', 'Nómina no encontrada');
      return res.redirect('/nomina/periodos');
    }
    
    res.render('nomina/recibo', {
      title: 'Recibo de Nómina',
      nomina
    });
  } catch (error) {
    console.error('Error al ver nómina:', error);
    req.flash('error', 'Error al cargar la nómina');
    res.redirect('/nomina/periodos');
  }
};

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

// Dashboard de nómina
export const dashboard = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    
    // Estadísticas generales
    const stats = {
      empleadosActivos: await prisma.empleados.count({ where: { ID_Estatus: 1 } }),
      periodosAnio: await prisma.periodos_Nomina.count({
        where: {
          Fecha_Inicio: {
            gte: new Date(currentYear, 0, 1),
            lt: new Date(currentYear + 1, 0, 1)
          }
        }
      }),
      periodoPendiente: await prisma.periodos_Nomina.findFirst({
        where: { Estado: 'PENDIENTE' },
        orderBy: { Fecha_Pago: 'asc' }
      })
    };
    
    // Últimos periodos
    const ultimosPeriodos = await prisma.periodos_Nomina.findMany({
      orderBy: { Fecha_Inicio: 'desc' },
      take: 5,
      include: {
        nominas: true
      }
    });
    
    // Calcular totales por periodo
    const periodosConTotales = ultimosPeriodos.map(p => ({
      ...p,
      totalNeto: p.nominas.reduce((sum, n) => sum + Number(n.Sueldo_Neto), 0),
      empleados: p.nominas.length
    }));
    
    res.render('nomina/dashboard', {
      title: 'Dashboard de Nómina',
      stats,
      periodosConTotales
    });
  } catch (error) {
    console.error('Error en dashboard nómina:', error);
    req.flash('error', 'Error al cargar el dashboard');
    res.redirect('/');
  }
};
