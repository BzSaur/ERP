/**
 * Controlador de Nómina
 * Gestión de periodos de nómina y cálculo de sueldos
 */

import prisma from '../config/database.js';

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
    req.flash('error', 'Error al crear el periodo de nómina');
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
    
    // Obtener empleados activos
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
        }
      }
    });
    
    // Actualizar estado del periodo
    await prisma.periodos_Nomina.update({
      where: { ID_Periodo: parseInt(id) },
      data: { Estado: 'PROCESANDO' }
    });
    
    let nominasCreadas = 0;
    
    for (const empleado of empleados) {
      // Calcular días trabajados
      const diasTrabajados = empleado.asistencia.filter(a => a.Presente).length || periodo.Dias_Periodo;
      const diasFaltas = empleado.asistencia.filter(a => !a.Presente && !a.Justificado).length;
      
      // Calcular horas adicionales
      const horasExtra = empleado.horas_adicionales
        .filter(h => h.Tipo_Hora === 'EXTRA')
        .reduce((sum, h) => sum + Number(h.Cantidad_Horas), 0);
      const horasDobles = empleado.horas_adicionales
        .filter(h => h.Tipo_Hora === 'DOBLE')
        .reduce((sum, h) => sum + Number(h.Cantidad_Horas), 0);
      const horasTriples = empleado.horas_adicionales
        .filter(h => h.Tipo_Hora === 'TRIPLE')
        .reduce((sum, h) => sum + Number(h.Cantidad_Horas), 0);
      
      // Salarios
      const salarioDiario = Number(empleado.Salario_Diario) || 0;
      const salarioHora = Number(empleado.Salario_Hora) || salarioDiario / 8;
      
      // Calcular percepciones
      const salarioBase = salarioDiario * (diasTrabajados - diasFaltas);
      const pagoHorasExtra = horasExtra * salarioHora * 1.5;   // 50% adicional
      const pagoHorasDobles = horasDobles * salarioHora * 2;   // 100% adicional
      const pagoHorasTriples = horasTriples * salarioHora * 3; // 200% adicional
      
      const totalPercepciones = salarioBase + pagoHorasExtra + pagoHorasDobles + pagoHorasTriples;
      
      // Calcular deducciones (simplificado)
      const deduccionIMSS = totalPercepciones * 0.02475; // Aprox IMSS empleado
      const deduccionISR = calcularISR(totalPercepciones); // ISR según tablas
      
      const totalDeducciones = deduccionIMSS + deduccionISR;
      const sueldoNeto = totalPercepciones - totalDeducciones;
      
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
          Horas_Normales: (diasTrabajados - diasFaltas) * 8,
          Horas_Extra: horasExtra,
          Horas_Dobles: horasDobles,
          Horas_Triples: horasTriples,
          Salario_Base: salarioBase,
          Pago_Horas_Extra: pagoHorasExtra,
          Pago_Horas_Dobles: pagoHorasDobles,
          Pago_Horas_Triples: pagoHorasTriples,
          Total_Percepciones: totalPercepciones,
          Deduccion_IMSS: deduccionIMSS,
          Deduccion_ISR: deduccionISR,
          Total_Deducciones: totalDeducciones,
          Sueldo_Neto: sueldoNeto,
          Estado: 'CALCULADO',
          CreatedBy: req.session.user?.Email_Office365 || null
        },
        update: {
          Dias_Trabajados: diasTrabajados,
          Dias_Faltas: diasFaltas,
          Horas_Normales: (diasTrabajados - diasFaltas) * 8,
          Horas_Extra: horasExtra,
          Horas_Dobles: horasDobles,
          Horas_Triples: horasTriples,
          Salario_Base: salarioBase,
          Pago_Horas_Extra: pagoHorasExtra,
          Pago_Horas_Dobles: pagoHorasDobles,
          Pago_Horas_Triples: pagoHorasTriples,
          Total_Percepciones: totalPercepciones,
          Deduccion_IMSS: deduccionIMSS,
          Deduccion_ISR: deduccionISR,
          Total_Deducciones: totalDeducciones,
          Sueldo_Neto: sueldoNeto,
          Estado: 'CALCULADO'
        }
      });
      
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

// Calcular ISR según tablas (simplificado para quincenal 2024)
function calcularISR(ingresoQuincenal) {
  // Tabla simplificada ISR quincenal 2024
  const tablaISR = [
    { limite: 385.04, cuota: 0, porcentaje: 0.0192 },
    { limite: 3265.04, cuota: 7.40, porcentaje: 0.0640 },
    { limite: 5737.30, cuota: 191.72, porcentaje: 0.1088 },
    { limite: 6667.82, cuota: 460.86, porcentaje: 0.16 },
    { limite: 7978.86, cuota: 609.64, porcentaje: 0.1792 },
    { limite: 16091.20, cuota: 844.60, porcentaje: 0.2136 },
    { limite: 25363.00, cuota: 2577.56, porcentaje: 0.2352 },
    { limite: 48403.10, cuota: 4758.48, porcentaje: 0.30 },
    { limite: 64537.32, cuota: 11670.70, porcentaje: 0.32 },
    { limite: 193611.80, cuota: 16833.66, porcentaje: 0.34 },
    { limite: Infinity, cuota: 60728.94, porcentaje: 0.35 }
  ];
  
  let limiteAnterior = 0;
  
  for (const rango of tablaISR) {
    if (ingresoQuincenal <= rango.limite) {
      const excedente = ingresoQuincenal - limiteAnterior;
      return rango.cuota + (excedente * rango.porcentaje);
    }
    limiteAnterior = rango.limite;
  }
  
  return 0;
}

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
