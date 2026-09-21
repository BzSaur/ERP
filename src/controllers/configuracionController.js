/**
 * Controlador de Configuración del Sistema (SuperAdmin)
 */

import prisma from '../config/database.js';
import { getAllConfig, updateConfig, getConfig } from '../services/nominaService.js';
import { simularChecada } from '../services/admsService.js';
import { reprogramarCronReporteAsistencia, enviarReporteAsistenciaSemanal } from '../services/reporteAsistenciaCronService.js';

// Panel de configuración
export const index = async (req, res) => {
  try {
    // Obtener estadísticas generales
    const stats = {
      totalEmpleados: await prisma.empleados.count(),
      totalUsuarios: await prisma.app_Usuarios.count(),
      totalAreas: await prisma.cat_Areas.count(),
      totalPuestos: await prisma.cat_Puestos.count(),
      totalNacionalidades: await prisma.cat_Nacionalidades.count(),
      totalHorarios: await prisma.cat_Tipo_Horario.count(),
      totalRoles: await prisma.cat_Roles.count(),
      totalEstatus: await prisma.cat_Estatus_Empleado.count()
    };
    
    // Obtener los roles del sistema
    const roles = await prisma.cat_Roles.findMany({
      orderBy: { ID_Rol: 'asc' }
    });
    
    // Obtener estatus de empleados
    const estatusEmpleado = await prisma.cat_Estatus_Empleado.findMany({
      orderBy: { ID_Estatus: 'asc' }
    });
    
    res.render('configuracion/index', {
      title: 'Configuración del Sistema',
      stats,
      roles,
      estatusEmpleado
    });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al cargar la configuración');
    res.redirect('/');
  }
};

// Gestión de Roles
export const roles = async (req, res) => {
  try {
    const roles = await prisma.cat_Roles.findMany({
      include: {
        _count: {
          select: { app_usuarios: true }
        }
      },
      orderBy: { ID_Rol: 'asc' }
    });
    
    res.render('configuracion/roles', {
      title: 'Gestión de Roles',
      roles
    });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al cargar los roles');
    res.redirect('/configuracion');
  }
};

// Crear rol
export const crearRol = async (req, res) => {
  try {
    const { Nombre_Rol, Descripcion } = req.body;
    
    await prisma.cat_Roles.create({
      data: {
        Nombre_Rol,
        Descripcion: Descripcion || null
      }
    });
    
    req.flash('success', 'Rol creado exitosamente');
    res.redirect('/configuracion/roles');
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al crear el rol');
    res.redirect('/configuracion/roles');
  }
};

// Actualizar rol
export const actualizarRol = async (req, res) => {
  try {
    const { id } = req.params;
    const { Nombre_Rol, Descripcion } = req.body;
    
    await prisma.cat_Roles.update({
      where: { ID_Rol: parseInt(id) },
      data: {
        Nombre_Rol,
        Descripcion: Descripcion || null
      }
    });
    
    req.flash('success', 'Rol actualizado');
    res.redirect('/configuracion/roles');
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al actualizar el rol');
    res.redirect('/configuracion/roles');
  }
};

// Gestión de Estatus
export const estatus = async (req, res) => {
  try {
    const estatusList = await prisma.cat_Estatus_Empleado.findMany({
      include: {
        _count: {
          select: { empleados: true }
        }
      },
      orderBy: { ID_Estatus: 'asc' }
    });
    
    res.render('configuracion/estatus', {
      title: 'Estatus de Empleados',
      estatusList
    });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al cargar los estatus');
    res.redirect('/configuracion');
  }
};

// Crear estatus
export const crearEstatus = async (req, res) => {
  try {
    const { Nombre_Estatus, Descripcion } = req.body;
    
    await prisma.cat_Estatus_Empleado.create({
      data: {
        Nombre_Estatus,
        Descripcion: Descripcion || null
      }
    });
    
    req.flash('success', 'Estatus creado exitosamente');
    res.redirect('/configuracion/estatus');
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al crear el estatus');
    res.redirect('/configuracion/estatus');
  }
};

// Actualizar estatus
export const actualizarEstatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { Nombre_Estatus, Descripcion } = req.body;
    
    await prisma.cat_Estatus_Empleado.update({
      where: { ID_Estatus: parseInt(id) },
      data: {
        Nombre_Estatus,
        Descripcion: Descripcion || null
      }
    });
    
    req.flash('success', 'Estatus actualizado');
    res.redirect('/configuracion/estatus');
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error al actualizar el estatus');
    res.redirect('/configuracion/estatus');
  }
};

// ============================================================
// CONFIGURACIÓN DE NÓMINA (SuperAdmin)
// ============================================================

// Ver toda la configuración de nómina
export const nominaConfig = async (req, res) => {
  try {
    const configuraciones = await prisma.configuracion_Nomina.findMany({
      orderBy: { Clave: 'asc' }
    });

    // Agrupar por categoría para la UI
    const categorias = {
      general: {
        titulo: 'General',
        icono: 'bi-gear',
        claves: ['TIPO_NOMINA', 'DIA_PAGO']
      },
      jornada: {
        titulo: 'Jornada y Horario',
        icono: 'bi-clock',
        claves: ['HORA_ENTRADA', 'HORA_SALIDA', 'HORA_COMIDA_INICIO', 'HORA_COMIDA_FIN', 'COMIDA_CON_GOCE', 'TOLERANCIA_MINUTOS', 'HORAS_DIARIAS', 'TRABAJA_SABADO', 'HORAS_SABADO', 'TRABAJA_DOMINGO']
      },
      deducciones: {
        titulo: 'Deducciones e Impuestos',
        icono: 'bi-cash-stack',
        claves: ['CALCULAR_ISR', 'TASA_ISR', 'CALCULAR_IMSS', 'TASA_IMSS_EMPLEADO']
      },
      bonos: {
        titulo: 'Bono de Puntualidad',
        icono: 'bi-star',
        claves: ['BONO_PUNTUALIDAD_ACTIVO', 'BONO_PUNTUALIDAD_MONTO', 'BONO_PUNTUALIDAD_CHECADAS', 'BONO_PUNTUALIDAD_DIAS']
      },
      horasExtra: {
        titulo: 'Horas Extra',
        icono: 'bi-hourglass-split',
        claves: ['HORAS_EXTRA_ACTIVO', 'HORAS_EXTRA_MAX_SEMANA', 'HORAS_EXTRA_DOBLES_LIMITE', 'HORAS_EXTRA_REQUIERE_AUTORIZACION']
      },
      prestamos: {
        titulo: 'Préstamos',
        icono: 'bi-bank',
        claves: ['PRESTAMOS_ACTIVO', 'PRESTAMOS_MESES_MINIMOS', 'PRESTAMOS_TASA_INTERES', 'PRESTAMOS_MONTO_MAXIMO']
      },
      vacaciones: {
        titulo: 'Vacaciones y Aguinaldo',
        icono: 'bi-calendar-check',
        claves: ['PRIMA_VACACIONAL_PCT', 'VACACIONES_ANTICIPACION_DIAS', 'VACACIONES_ACUMULABLES', 'VACACIONES_PERIODO_PROHIBIDO', 'DIAS_AGUINALDO', 'FECHA_PAGO_AGUINALDO']
      },
      incidencias: {
        titulo: 'Faltas e Incidencias',
        icono: 'bi-exclamation-triangle',
        claves: ['FALTAS_PARA_RESCISION', 'DIAS_ABANDONO_TRABAJO', 'LICENCIA_LUTO_DIAS', 'LICENCIA_PATERNIDAD_DIAS']
      },
      reportesAsistencia: {
        titulo: 'Reporte de Asistencia por Correo',
        icono: 'bi-envelope-paper',
        claves: ['REPORTES_ASISTENCIA_ACTIVO', 'REPORTES_ASISTENCIA_EMAILS', 'REPORTES_ASISTENCIA_CRON', 'REPORTES_ASISTENCIA_TZ']
      },
      otros: {
        titulo: 'Otros',
        icono: 'bi-three-dots',
        claves: ['PRIMA_DOMINICAL_PCT', 'SUCURSALES', 'UMA_DIARIO_2026', 'SALARIO_MINIMO_2026']
      }
    };

    // Mapear configuraciones por clave
    const configMap = {};
    configuraciones.forEach(c => {
      configMap[c.Clave] = c;
    });

    const cronActual = configMap.REPORTES_ASISTENCIA_CRON?.Valor || '0 22 * * 4';
    const partesCron = cronActual.match(/^([0-9]+)\s+([0-9]+)\s+\*\s+\*\s+([0-7])$/);
    const reporteAsistenciaHorario = {
      minuto: partesCron ? partesCron[1].padStart(2, '0') : '00',
      hora: partesCron ? partesCron[2].padStart(2, '0') : '22',
      dia: partesCron ? partesCron[3] : '4'
    };

    res.render('configuracion/nomina-config', {
      title: 'Configuración de Nómina',
      configuraciones,
      categorias,
      configMap,
      reporteAsistenciaHorario
    });
  } catch (error) {
    console.error('Error al cargar config nómina:', error);
    req.flash('error', 'Error al cargar la configuración de nómina');
    res.redirect('/configuracion');
  }
};

// Actualizar un parámetro de configuración
export const actualizarNominaConfig = async (req, res) => {
  try {
    const { clave } = req.params;
    const { valor } = req.body;
    
    const config = await prisma.configuracion_Nomina.findUnique({
      where: { Clave: clave }
    });
    
    if (!config) {
      req.flash('error', `Configuración "${clave}" no encontrada`);
      return res.redirect('/configuracion/nomina');
    }
    
    // Validar tipo de dato
    if (config.Tipo_Dato === 'INT' && isNaN(parseInt(valor))) {
      req.flash('error', `El valor para "${clave}" debe ser un número entero`);
      return res.redirect('/configuracion/nomina');
    }
    if (config.Tipo_Dato === 'DECIMAL' && isNaN(parseFloat(valor))) {
      req.flash('error', `El valor para "${clave}" debe ser un número decimal`);
      return res.redirect('/configuracion/nomina');
    }
    
    await updateConfig(clave, valor, req.session.user?.Email_Office365 || 'SuperAdmin');
    if (clave.startsWith('REPORTES_ASISTENCIA_')) await reprogramarCronReporteAsistencia();
    
    req.flash('success', `Configuración "${clave}" actualizada a "${valor}"`);
    res.redirect('/configuracion/nomina');
  } catch (error) {
    console.error('Error al actualizar config:', error);
    req.flash('error', 'Error al actualizar la configuración');
    res.redirect('/configuracion/nomina');
  }
};

// Enviar manualmente el reporte de asistencia de la semana elegida (viernes a jueves)
export const enviarReporteAsistenciaManual = async (req, res) => {
  try {
    const { fecha } = req.body;
    const fechaRef = fecha ? new Date(`${fecha}T12:00:00`) : new Date();
    if (isNaN(fechaRef.getTime())) {
      req.flash('error', 'Fecha inválida');
      return res.redirect('/configuracion/nomina');
    }
    const resultado = await enviarReporteAsistenciaSemanal(fechaRef);
    const f1 = resultado.inicio.toISOString().slice(0, 10);
    const f2 = resultado.fin.toISOString().slice(0, 10);
    req.flash('success', `Reporte ${f1} al ${f2} enviado a ${resultado.destinatarios.length} destinatario(s)`);
  } catch (error) {
    console.error('Error al enviar reporte de asistencia manual:', error);
    req.flash('error', `No se pudo enviar el reporte: ${error.message}`);
  }
  res.redirect('/configuracion/nomina');
};

// Actualizar múltiples parámetros de una categoría
export const actualizarCategoriaNominaConfig = async (req, res) => {
  try {
    const configs = req.body;
    let actualizados = 0;
    const camposHorario = ['REPORTES_ASISTENCIA_DIA', 'REPORTES_ASISTENCIA_HORA'];
    
    for (const [clave, valor] of Object.entries(configs)) {
      if (clave === '_method' || camposHorario.includes(clave)) continue;
      
      try {
        await updateConfig(clave, valor, req.session.user?.Email_Office365 || 'SuperAdmin');
        actualizados++;
      } catch (err) {
        console.error(`Error actualizando ${clave}:`, err);
      }
    }

    if (configs.REPORTES_ASISTENCIA_DIA !== undefined || configs.REPORTES_ASISTENCIA_HORA !== undefined) {
      const dia = String(configs.REPORTES_ASISTENCIA_DIA || '4');
      const horaCompleta = String(configs.REPORTES_ASISTENCIA_HORA || '22:00');
      const [hora, minuto] = horaCompleta.split(':').map(Number);
      if (!/^[0-7]$/.test(dia) || !Number.isInteger(hora) || hora < 0 || hora > 23 || !Number.isInteger(minuto) || minuto < 0 || minuto > 59) {
        req.flash('error', 'El día o la hora del reporte no son válidos');
        return res.redirect('/configuracion/nomina');
      }
      await updateConfig('REPORTES_ASISTENCIA_CRON', `${minuto} ${hora} * * ${dia}`, req.session.user?.Email_Office365 || 'SuperAdmin');
      actualizados++;
    }

    if (Object.keys(configs).some(clave => clave.startsWith('REPORTES_ASISTENCIA_'))) {
      await reprogramarCronReporteAsistencia();
    }
    
    req.flash('success', `${actualizados} parámetro(s) actualizados correctamente`);
    res.redirect('/configuracion/nomina');
  } catch (error) {
    console.error('Error al actualizar configs:', error);
    req.flash('error', 'Error al actualizar la configuración');
    res.redirect('/configuracion/nomina');
  }
};

// ============================================================
// SIMULADOR DE CHECADOR (QA · solo SuperAdmin)
// ============================================================

export const qaChecadorForm = async (req, res) => {
  try {
    const checadores = await prisma.checadores.findMany({
      where: { Activo: true },
      select: { ID_Checador: true, Nombre: true, Serial_Number: true, planta: { select: { Nombre: true } } },
      orderBy: { Nombre: 'asc' }
    });
    res.render('configuracion/qa-checador', {
      title: 'QA Checador',
      checadores,
      resultado: null
    });
  } catch (error) {
    console.error('Error qaChecadorForm:', error);
    req.flash('error', 'Error al cargar el simulador');
    res.redirect('/configuracion');
  }
};

export const qaChecadorEjecutar = async (req, res) => {
  const { idEmpleado, fecha, hora, idChecador, verify } = req.body;
  try {
    if (!idEmpleado || !fecha || !hora || !idChecador) {
      req.flash('error', 'Faltan campos: empleado, fecha, hora y checador son obligatorios');
      return res.redirect('/configuracion/_qa-checador');
    }
    const timestampRaw = `${fecha} ${hora}:00`;

    const actor = req.user?.Email_Office365 || req.session?.user?.Email_Office365 || `usuario:${req.user?.ID_Usuario ?? '?'}`;
    console.warn(`[QA-CHECADOR] superadmin=${actor} inyecta empleado=${idEmpleado} ts="${timestampRaw}" checador=${idChecador}`);

    const r = await simularChecada({
      idEmpleado,
      timestampRaw,
      idChecador,
      verify: verify ? Number(verify) : null
    });

    const msg = { procesada: 'Checada inyectada y jornada recalculada', duplicada: 'Checada duplicada (idempotente, ya existía)', huerfana: 'PIN huérfano: el ID de empleado no existe' }[r] || `Resultado: ${r}`;
    req.flash(r === 'huerfana' ? 'error' : 'success', msg);
    res.redirect('/configuracion/_qa-checador');
  } catch (error) {
    console.error('Error qaChecadorEjecutar:', error);
    req.flash('error', `Error al inyectar: ${error.message}`);
    res.redirect('/configuracion/_qa-checador');
  }
};
