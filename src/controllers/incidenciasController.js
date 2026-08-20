/**
 * Controlador de Incidencias (faltas, permisos e incapacidades)
 *
 * Complementa a Vacaciones: cubre las ausencias que NO son vacaciones —
 * faltas justificadas o injustificadas, permisos con y sin goce de sueldo,
 * incapacidades del IMSS y licencias.
 *
 * El goce de sueldo decide si el día cuenta 9h en asistencia/nómina o si solo
 * se etiqueta sin pagar (ver asistenciaService.obtenerAusenciasJustificadas).
 * Por defecto se hereda del tipo elegido, pero puede ajustarse por incidencia
 * para casos particulares.
 *
 * Solo las incidencias APROBADAS afectan la asistencia.
 */

import prisma from '../config/database.js';
import { registrarCambio, obtenerIP } from '../middleware/audit.js';
import * as asistenciaService from '../services/asistenciaService.js';
import { getSemanaActual } from '../services/nominaService.js';
// La detección y el bloqueo viven en abandonoService: la sincronización del
// checador los ejecuta también, para que apliquen en cuanto llegan checadas.
import { detectarAbandono, bloquearPorAbandono } from '../services/abandonoService.js';
import { encolarAltaEmpleado } from '../services/checadorComandosService.js';

/**
 * Rehabilita en el checador a quien se acaba de reactivar.
 *
 * Sin esto, RH cambia el estatus pero la persona sigue sin poder checar hasta
 * que alguien entre a /admin/checadores a sincronizar — justo lo contrario del
 * flujo que RH necesita (se presenta, lo reactivan, vuelve a trabajar).
 *
 * Se manda CREATE_USER (`Pri=0` sin `Enable=0`), que vuelve a habilitar el PIN
 * conservando la huella ya enrolada. Best-effort: si falla, la reactivación en
 * BD no se revierte — la sincronización periódica lo corrige después.
 *
 * @returns {Promise<number>} comandos encolados (uno por checador activo)
 */
async function rehabilitarEnChecador(empleados) {
  let total = 0;
  for (const e of empleados) {
    try {
      total += await encolarAltaEmpleado(e, 'CREATE_USER');
    } catch (err) {
      // best-effort: no romper la reactivación por un fallo de cola
    }
  }
  return total;
}

// Días naturales que abarca un rango, ambos extremos incluidos.
function diasEntre(inicio, fin) {
  return Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24)) + 1;
}

// GET /incidencias - Control de faltas del periodo.
// Cruza los días SIN checada que detecta el checador (la falta real) con las
// incidencias capturadas (la justificación). Las justificadas se muestran
// primero en verde; las que siguen sin justificar, en rojo pastel.
export const index = async (req, res, next) => {
  try {
    const { tipo, empleado } = req.query;

    // Rango: semana en curso por defecto.
    const semana = getSemanaActual();
    const inicio = req.query.desde ? new Date(`${req.query.desde}T00:00:00`) : semana.lunes;
    const fin = req.query.hasta ? new Date(`${req.query.hasta}T00:00:00`) : semana.sabado;
    inicio.setHours(0, 0, 0, 0);
    fin.setHours(23, 59, 59, 999);

    const idEmpleadoFiltro = empleado ? parseInt(empleado) : null;

    const [tipos, empleados] = await Promise.all([
      prisma.cat_Tipo_Incidencia.findMany({ where: { Activo: true }, orderBy: { Nombre: 'asc' } }),
      prisma.empleados.findMany({
        where: { ID_Estatus: 1 },
        select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true },
        orderBy: [{ Apellido_Paterno: 'asc' }, { Nombre: 'asc' }]
      })
    ]);

    // Matriz de asistencia del rango: de ahí salen los días marcados como
    // `vacio` (laborable, sin checada, sin ausencia ni actividad) = falta real.
    const datos = await asistenciaService.obtenerHorasSemanalTodos(
      inicio, fin,
      idEmpleadoFiltro ? { idsPermitidos: [idEmpleadoFiltro] } : null
    );

    // Días de HOY en adelante no son falta todavía: la jornada no ha cerrado.
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    const faltas = [];
    for (const fila of datos.filas) {
      fila.celdas.forEach((c, i) => {
        if (!c.vacio) return; // solo días sin justificar ni cubrir
        const f = datos.fechas[i];
        if (!f || new Date(f) >= hoy) return;
        faltas.push({
          ID_Empleado: fila.ID_Empleado,
          nombre: fila.nombre,
          area: fila.area,
          fecha: new Date(f).toISOString().slice(0, 10),
          diaSemana: new Date(f).getDay()
        });
      });
    }
    faltas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre));

    // Alertas de abandono, evaluadas sobre los últimos 30 días (no solo el
    // rango visible): un patrón de faltas no se corta por el filtro de fechas.
    const alertas = await detectarAbandono(idEmpleadoFiltro);

    // DESACTIVADO: ver nota en checadorComandosService. El patrón se muestra
    // como alerta y RH bloquea manualmente desde el panel.
    const bloqueadosAhora = [];

    // Empleados actualmente fuera del checador. Va aparte de las alertas: uno
    // puede seguir suspendido aunque ya no cumpla el patrón de faltas, y sin
    // esta lista no habría forma de reactivarlo desde la interfaz.
    const suspendidos = await prisma.empleados.findMany({
      where: { estatus: { is: { Nombre_Estatus: 'SUSPENDIDO' } } },
      select: {
        ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true,
        area: { select: { Nombre_Area: true } }
      },
      orderBy: [{ Apellido_Paterno: 'asc' }, { Nombre: 'asc' }]
    });

    // Estatus actual de los alertados, para mostrar si ya están bloqueados.
    if (alertas.length) {
      const estatusEmp = await prisma.empleados.findMany({
        where: { ID_Empleado: { in: alertas.map(a => a.ID_Empleado) } },
        select: { ID_Empleado: true, estatus: { select: { Nombre_Estatus: true } } }
      });
      const porEmp = new Map(estatusEmp.map(e => [e.ID_Empleado, e.estatus?.Nombre_Estatus]));
      alertas.forEach(a => {
        a.estatus = porEmp.get(a.ID_Empleado) || null;
        a.bloqueado = a.estatus === 'SUSPENDIDO';
      });
    }

    // Si el checador no reportó NADA en el rango, marcar falta a toda la
    // plantilla sería ruido: se avisa en vez de listar cientos de filas.
    const totalChecadas = datos.filas.reduce((s, f) => s + (f.dias || 0), 0);
    const sinDatosDelChecador = faltas.length > 0 && totalChecadas === 0;

    // Incidencias que caen dentro del rango (la justificación ya capturada).
    const whereInc = {
      Fecha_Inicio: { lte: fin },
      Fecha_Fin: { gte: inicio }
    };
    if (tipo) whereInc.ID_Tipo_Incidencia = parseInt(tipo);
    if (idEmpleadoFiltro) whereInc.ID_Empleado = idEmpleadoFiltro;

    const incidencias = await prisma.empleados_Incidencias.findMany({
      where: whereInc,
      include: {
        empleado: { select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true, area: { select: { Nombre_Area: true } } } },
        tipo_incidencia: { select: { Nombre: true, Codigo: true, Con_Goce_Sueldo: true, Requiere_Documento: true } }
      },
      orderBy: [{ Fecha_Inicio: 'desc' }]
    });

    // Permisos ya autorizados que aún no empiezan: se listan aparte para no
    // confundirlos con los del periodo en curso.
    const futuras = await prisma.empleados_Incidencias.findMany({
      where: {
        Fecha_Inicio: { gt: fin },
        Estado: { in: ['APROBADA', 'PENDIENTE'] },
        ...(idEmpleadoFiltro ? { ID_Empleado: idEmpleadoFiltro } : {}),
        ...(tipo ? { ID_Tipo_Incidencia: parseInt(tipo) } : {})
      },
      include: {
        empleado: { select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true } },
        tipo_incidencia: { select: { Nombre: true, Con_Goce_Sueldo: true } }
      },
      orderBy: { Fecha_Inicio: 'asc' },
      take: 50
    });

    const fmtIn = (d) => new Date(d).toISOString().slice(0, 10);
    res.render('incidencias/index', {
      futuras,
      title: 'Faltas y permisos',
      incidencias,
      faltas,
      alertas,
      bloqueadosAhora,
      suspendidos,
      tipos,
      empleados,
      stats: {
        sinJustificar: faltas.length,
        justificadas: incidencias.filter(i => i.Estado === 'APROBADA').length
      },
      sinDatosDelChecador,
      filtros: { tipo: tipo || '', empleado: empleado || '' },
      desde: fmtIn(inicio),
      hasta: fmtIn(fin)
    });
  } catch (error) {
    next(error);
  }
};

// GET /incidencias/crear - Formulario de alta
export const crear = async (req, res, next) => {
  try {
    const [tipos, empleados] = await Promise.all([
      prisma.cat_Tipo_Incidencia.findMany({ where: { Activo: true }, orderBy: { Nombre: 'asc' } }),
      prisma.empleados.findMany({
        where: { ID_Estatus: 1 },
        select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true },
        orderBy: [{ Apellido_Paterno: 'asc' }, { Nombre: 'asc' }]
      })
    ]);

    res.render('incidencias/crear', {
      title: 'Registrar falta o permiso',
      tipos,
      empleados,
      preEmpleado: req.query.empleado ? parseInt(req.query.empleado) : null,
      preFecha: /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha || '') ? req.query.fecha : null
    });
  } catch (error) {
    next(error);
  }
};

// Valida el cuerpo compartido por alta y edición. Devuelve
// { ok:false, error } o { ok:true, datos } listo para escribir.
async function validar(body, idExcluir = null) {
  const idEmpleado = parseInt(body.ID_Empleado);
  const idTipo = parseInt(body.ID_Tipo_Incidencia);
  const inicio = new Date(`${body.Fecha_Inicio}T00:00:00`);
  const fin = new Date(`${body.Fecha_Fin}T00:00:00`);

  if (!Number.isInteger(idEmpleado) || !Number.isInteger(idTipo)) {
    return { ok: false, error: 'Selecciona empleado y tipo de incidencia' };
  }
  if (isNaN(inicio.getTime()) || isNaN(fin.getTime()) || fin < inicio) {
    return { ok: false, error: 'Rango de fechas inválido' };
  }

  const tipo = await prisma.cat_Tipo_Incidencia.findUnique({ where: { ID_Tipo_Incidencia: idTipo } });
  if (!tipo || !tipo.Activo) {
    return { ok: false, error: 'El tipo de incidencia seleccionado ya no está disponible' };
  }

  const dias = diasEntre(inicio, fin);
  if (tipo.Dias_Maximos && dias > tipo.Dias_Maximos) {
    return { ok: false, error: `${tipo.Nombre} permite máximo ${tipo.Dias_Maximos} día(s); se solicitaron ${dias}` };
  }

  // Traslape con otra incidencia vigente del mismo empleado.
  const whereTraslape = {
    ID_Empleado: idEmpleado,
    Estado: { in: ['PENDIENTE', 'APROBADA'] },
    Fecha_Inicio: { lte: fin },
    Fecha_Fin: { gte: inicio }
  };
  if (idExcluir) whereTraslape.ID_Incidencia = { not: idExcluir };
  const traslape = await prisma.empleados_Incidencias.findFirst({
    where: whereTraslape,
    include: { tipo_incidencia: { select: { Nombre: true } } }
  });
  if (traslape) {
    return { ok: false, error: `Se traslapa con otra incidencia del empleado (${traslape.tipo_incidencia.Nombre})` };
  }

  // Traslape con vacaciones aprobadas.
  const vacas = await prisma.vacaciones_Periodos.findFirst({
    where: { ID_Empleado: idEmpleado, Estado: 'APROBADO', Fecha_Inicio: { lte: fin }, Fecha_Fin: { gte: inicio } }
  });
  if (vacas) {
    return { ok: false, error: 'El rango se traslapa con un periodo de vacaciones del empleado' };
  }

  return {
    ok: true,
    tipo,
    datos: {
      ID_Empleado: idEmpleado,
      ID_Tipo_Incidencia: idTipo,
      Fecha_Inicio: inicio,
      Fecha_Fin: fin,
      Dias_Totales: dias,
      // Se hereda del catálogo salvo que se ajuste explícitamente.
      Con_Goce_Sueldo: body.Con_Goce_Sueldo != null
        ? (body.Con_Goce_Sueldo === 'on' || body.Con_Goce_Sueldo === 'true' || body.Con_Goce_Sueldo === true)
        : tipo.Con_Goce_Sueldo,
      Folio_Documento: body.Folio_Documento?.trim() || null,
      // Se deriva del folio capturado: no se pregunta por separado.
      Tiene_Documento: !!body.Folio_Documento?.trim(),
      Observaciones: body.Observaciones?.trim() || null
    }
  };
}

// POST /incidencias - Guardar nueva
export const store = async (req, res, next) => {
  try {
    const v = await validar(req.body);
    if (!v.ok) {
      req.flash('error', v.error);
      return res.redirect('/incidencias/crear');
    }

    // Si el tipo exige documento, no puede quedar sin folio.
    if (v.tipo.Requiere_Documento && !v.datos.Folio_Documento) {
      req.flash('error', `${v.tipo.Nombre} requiere folio del documento comprobatorio`);
      return res.redirect('/incidencias/crear');
    }

    // Se registra ya aprobada: quien captura en RH es quien autoriza.
    const creada = await prisma.empleados_Incidencias.create({
      data: {
        ...v.datos,
        Estado: 'APROBADA',
        Aprobado_Por: req.user?.ID_Usuario || null,
        Fecha_Aprobacion: new Date(),
        CreatedBy: req.user?.Email_Office365 || null
      }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'CREATE',
      tabla: 'Empleados_Incidencias',
      idRegistro: creada.ID_Incidencia.toString(),
      descripcion: `Incidencia registrada: ${v.tipo.Nombre} para empleado ${v.datos.ID_Empleado} (${v.datos.Dias_Totales} día(s), ${v.datos.Con_Goce_Sueldo ? 'con' : 'sin'} goce)`,
      datosNuevos: v.datos,
      ip: obtenerIP(req)
    });

    req.flash('success', `${v.tipo.Nombre} registrada: ${v.datos.Dias_Totales} día(s)`);
    res.redirect('/incidencias');
  } catch (error) {
    next(error);
  }
};

// GET /incidencias/:id/editar - Formulario de edición
export const editar = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const incidencia = await prisma.empleados_Incidencias.findUnique({
      where: { ID_Incidencia: id },
      include: {
        empleado: { select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true } },
        tipo_incidencia: true
      }
    });

    if (!incidencia) {
      req.flash('error', 'Incidencia no encontrada');
      return res.redirect('/incidencias');
    }

    const [tipos, empleados] = await Promise.all([
      prisma.cat_Tipo_Incidencia.findMany({ where: { Activo: true }, orderBy: { Nombre: 'asc' } }),
      prisma.empleados.findMany({
        where: { ID_Estatus: 1 },
        select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true },
        orderBy: [{ Apellido_Paterno: 'asc' }, { Nombre: 'asc' }]
      })
    ]);

    const fmt = (d) => new Date(d).toISOString().slice(0, 10);
    res.render('incidencias/editar', {
      title: 'Editar incidencia',
      incidencia,
      tipos,
      empleados,
      fechaInicio: fmt(incidencia.Fecha_Inicio),
      fechaFin: fmt(incidencia.Fecha_Fin)
    });
  } catch (error) {
    next(error);
  }
};

// POST /incidencias/:id - Actualizar
export const actualizar = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const previa = await prisma.empleados_Incidencias.findUnique({
      where: { ID_Incidencia: id },
      include: { tipo_incidencia: { select: { Nombre: true } } }
    });
    if (!previa) {
      req.flash('error', 'Incidencia no encontrada');
      return res.redirect('/incidencias');
    }
    const volver = `/incidencias/${id}/editar`;

    const v = await validar(req.body, id);
    if (!v.ok) {
      req.flash('error', v.error);
      return res.redirect(volver);
    }

    const actualizada = await prisma.empleados_Incidencias.update({
      where: { ID_Incidencia: id },
      data: v.datos
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'Empleados_Incidencias',
      idRegistro: id.toString(),
      descripcion: `Incidencia editada: ${v.tipo.Nombre} (empleado ${v.datos.ID_Empleado}, ${previa.Dias_Totales} → ${v.datos.Dias_Totales} día(s))`,
      datosPrevios: {
        ID_Tipo_Incidencia: previa.ID_Tipo_Incidencia,
        Fecha_Inicio: previa.Fecha_Inicio, Fecha_Fin: previa.Fecha_Fin,
        Dias_Totales: previa.Dias_Totales, Con_Goce_Sueldo: previa.Con_Goce_Sueldo
      },
      datosNuevos: v.datos,
      ip: obtenerIP(req)
    });

    req.flash('success', 'Incidencia actualizada');
    res.redirect('/incidencias');
  } catch (error) {
    next(error);
  }
};

// POST /incidencias/:id/cancelar - Deja de contar sin borrar el registro
export const cancelar = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const incidencia = await prisma.empleados_Incidencias.findUnique({
      where: { ID_Incidencia: id },
      include: { tipo_incidencia: { select: { Nombre: true } } }
    });
    if (!incidencia) {
      req.flash('error', 'Incidencia no encontrada');
      return res.redirect('/incidencias');
    }
    if (incidencia.Estado === 'CANCELADA') {
      req.flash('info', 'Esa incidencia ya estaba cancelada');
      return res.redirect('/incidencias');
    }

    await prisma.empleados_Incidencias.update({
      where: { ID_Incidencia: id },
      data: {
        Estado: 'CANCELADA',
        Motivo_Rechazo: req.body.Motivo?.trim() || null
      }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'Empleados_Incidencias',
      idRegistro: id.toString(),
      descripcion: `Incidencia CANCELADA: ${incidencia.tipo_incidencia.Nombre} (empleado ${incidencia.ID_Empleado})`,
      datosPrevios: { Estado: incidencia.Estado },
      datosNuevos: { Estado: 'CANCELADA' },
      ip: obtenerIP(req)
    });

    req.flash('success', 'Incidencia cancelada — deja de afectar la asistencia');
    res.redirect('/incidencias');
  } catch (error) {
    next(error);
  }
};

// POST /incidencias/reactivar/:idEmpleado - RH devuelve a ACTIVO a un empleado
// bloqueado por faltas: vuelve a entrar al checador en la siguiente
// sincronización. Es el cierre del ciclo (se presentó con RH).
export const reactivarEmpleado = async (req, res, next) => {
  try {
    const id = parseInt(req.params.idEmpleado);
    const empleado = await prisma.empleados.findUnique({
      where: { ID_Empleado: id },
      select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true, estatus: { select: { Nombre_Estatus: true } } }
    });
    if (!empleado) {
      req.flash('error', 'Empleado no encontrado');
      return res.redirect('/incidencias');
    }
    if (empleado.estatus?.Nombre_Estatus !== 'SUSPENDIDO') {
      req.flash('info', 'Ese empleado no está bloqueado');
      return res.redirect('/incidencias');
    }

    const activo = await prisma.cat_Estatus_Empleado.findFirst({ where: { Nombre_Estatus: 'ACTIVO' } });
    await prisma.empleados.update({
      where: { ID_Empleado: id },
      data: { ID_Estatus: activo.ID_Estatus }
    });

    await registrarCambio({
      usuario: req.user,
      accion: 'UPDATE',
      tabla: 'Empleados',
      idRegistro: id.toString(),
      descripcion: `Checador REACTIVADO por RH: ${empleado.Nombre} ${empleado.Apellido_Paterno} (SUSPENDIDO → ACTIVO)${req.body.Motivo ? '. ' + req.body.Motivo.trim() : ''}`,
      datosPrevios: { Estatus: 'SUSPENDIDO' },
      datosNuevos: { Estatus: 'ACTIVO' },
      ip: obtenerIP(req)
    });

    const encolados = await rehabilitarEnChecador([empleado]);
    req.flash('success', encolados > 0
      ? `${empleado.Nombre} ${empleado.Apellido_Paterno} reactivado — ya puede checar (conserva su huella)`
      : `${empleado.Nombre} ${empleado.Apellido_Paterno} reactivado — sin checadores activos para notificar`);
    res.redirect('/incidencias');
  } catch (error) {
    next(error);
  }
};

// POST /incidencias/reactivar-lote - Reactiva varios bloqueados de una vez.
// Body: empleados[] con los IDs marcados, o Todos='on' para todos los
// suspendidos. Útil para RH cuando se presentan varios y para pruebas.
export const reactivarLote = async (req, res, next) => {
  try {
    const suspendido = { estatus: { is: { Nombre_Estatus: 'SUSPENDIDO' } } };

    let where;
    if (req.body.Todos === 'on' || req.body.Todos === 'true') {
      where = suspendido;
    } else {
      const ids = (req.body.empleados == null ? [] : Array.isArray(req.body.empleados) ? req.body.empleados : [req.body.empleados])
        .map(Number).filter(Number.isInteger);
      if (ids.length === 0) {
        req.flash('error', 'Selecciona al menos un empleado para reactivar');
        return res.redirect('/incidencias');
      }
      where = { ...suspendido, ID_Empleado: { in: ids } };
    }

    const aReactivar = await prisma.empleados.findMany({
      where,
      select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true }
    });
    if (aReactivar.length === 0) {
      req.flash('info', 'No hay empleados bloqueados que reactivar');
      return res.redirect('/incidencias');
    }

    const activo = await prisma.cat_Estatus_Empleado.findFirst({ where: { Nombre_Estatus: 'ACTIVO' } });
    await prisma.empleados.updateMany({
      where: { ID_Empleado: { in: aReactivar.map(e => e.ID_Empleado) } },
      data: { ID_Estatus: activo.ID_Estatus }
    });

    for (const e of aReactivar) {
      try {
        await registrarCambio({
          usuario: req.user,
          accion: 'UPDATE',
          tabla: 'Empleados',
          idRegistro: e.ID_Empleado.toString(),
          descripcion: `Checador REACTIVADO por RH (lote): ${e.Nombre} ${e.Apellido_Paterno} (SUSPENDIDO → ACTIVO)`,
          datosPrevios: { Estatus: 'SUSPENDIDO' },
          datosNuevos: { Estatus: 'ACTIVO' },
          ip: obtenerIP(req)
        });
      } catch (err) {
        // bitácora best-effort
      }
    }

    const encolados = await rehabilitarEnChecador(aReactivar);
    req.flash('success', encolados > 0
      ? `${aReactivar.length} empleado(s) reactivados — ya pueden checar (conservan su huella)`
      : `${aReactivar.length} empleado(s) reactivados — sin checadores activos para notificar`);
    res.redirect('/incidencias');
  } catch (error) {
    next(error);
  }
};

export default { index, crear, store, editar, actualizar, cancelar, reactivarEmpleado, reactivarLote };
