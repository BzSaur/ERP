/**
 * Controlador de administración de Checadores y Plantas (módulo ADMS).
 * Protegido para Administrador / SuperAdministrador.
 *
 * Cubre: CRUD de checadores, alta de plantas, aprobación de devices
 * auto-descubiertos (pendiente_aprobacion), diagnóstico por device y
 * reconciliación de checadas huérfanas.
 */

import prisma from '../config/database.js';
import { registrarCambio, obtenerIP } from '../middleware/audit.js';
import { sincronizarTodos } from '../services/checadorComandosService.js';
import { horaLocalDevice } from '../utils/tiempo.js';

// ============================================================
// LISTADO
// ============================================================

export const index = async (req, res, next) => {
  try {
    const [checadores, pendientesCount, huerfanasCount] = await Promise.all([
      prisma.checadores.findMany({
        where: { Estado_Registro: 'aprobado' },
        include: {
          planta: { select: { Nombre: true } },
          _count: { select: { comandos: { where: { Estatus: 'pendiente' } } } }
        },
        orderBy: [{ ID_Planta: 'asc' }, { Nombre: 'asc' }]
      }),
      prisma.checadores.count({ where: { Estado_Registro: 'pendiente_aprobacion' } }),
      prisma.checadas_Huerfanas.count({ where: { Resuelto: false } })
    ]);

    res.render('checadores/index', {
      title: 'Checadores',
      checadores,
      pendientesCount,
      huerfanasCount
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// CRUD CHECADOR
// ============================================================

export const crear = async (req, res, next) => {
  try {
    const plantas = await prisma.cat_Plantas.findMany({ where: { Activo: true }, orderBy: { Nombre: 'asc' } });
    res.render('checadores/crear', { title: 'Nuevo Checador', plantas, checador: null });
  } catch (error) {
    next(error);
  }
};

export const store = async (req, res, next) => {
  try {
    const { Serial_Number, Nombre, ID_Planta, Ubicacion_Codigo, Ubicacion_Detalle, IP_Local, Modelo } = req.body;

    const checador = await prisma.checadores.create({
      data: {
        Serial_Number: String(Serial_Number).trim(),
        Nombre: String(Nombre).trim(),
        ID_Planta: parseInt(ID_Planta),
        Ubicacion_Codigo: Ubicacion_Codigo ? String(Ubicacion_Codigo).trim().toUpperCase() : null,
        Ubicacion_Detalle: Ubicacion_Detalle || null,
        IP_Local: IP_Local || null,
        Modelo: Modelo || 'CLK-980',
        Estado_Registro: 'aprobado',
        Activo: true
      }
    });

    await registrarCambio({
      usuario: req.user, accion: 'CREATE', tabla: 'Checadores',
      idRegistro: checador.ID_Checador.toString(),
      descripcion: `Alta de checador: ${checador.Nombre} (${checador.Serial_Number})`,
      datosNuevos: { Serial_Number, Nombre, ID_Planta }, ip: obtenerIP(req)
    });

    req.flash('success', `Checador ${checador.Nombre} registrado`);
    res.redirect('/checadores');
  } catch (error) {
    if (error.code === 'P2002') {
      req.flash('error', 'Ya existe un checador con ese número de serie');
      return res.redirect('/checadores/crear');
    }
    next(error);
  }
};

export const editar = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [checador, plantas] = await Promise.all([
      prisma.checadores.findUnique({ where: { ID_Checador: id } }),
      prisma.cat_Plantas.findMany({ where: { Activo: true }, orderBy: { Nombre: 'asc' } })
    ]);
    if (!checador) return res.status(404).render('errors/404', { title: 'No encontrado', message: 'Checador no existe' });
    res.render('checadores/crear', { title: `Editar: ${checador.Nombre}`, plantas, checador });
  } catch (error) {
    next(error);
  }
};

export const update = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { Nombre, ID_Planta, Ubicacion_Codigo, Ubicacion_Detalle, IP_Local, Modelo, Activo } = req.body;

    await prisma.checadores.update({
      where: { ID_Checador: id },
      data: {
        Nombre: String(Nombre).trim(),
        ID_Planta: parseInt(ID_Planta),
        Ubicacion_Codigo: Ubicacion_Codigo ? String(Ubicacion_Codigo).trim().toUpperCase() : null,
        Ubicacion_Detalle: Ubicacion_Detalle || null,
        IP_Local: IP_Local || null,
        Modelo: Modelo || 'CLK-980',
        Activo: Activo === 'on' || Activo === 'true' || Activo === true
      }
    });

    await registrarCambio({
      usuario: req.user, accion: 'UPDATE', tabla: 'Checadores',
      idRegistro: id.toString(), descripcion: `Actualización de checador ${Nombre}`,
      datosNuevos: { Nombre, ID_Planta }, ip: obtenerIP(req)
    });

    req.flash('success', 'Checador actualizado');
    res.redirect('/checadores');
  } catch (error) {
    next(error);
  }
};

export const destroy = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const checador = await prisma.checadores.findUnique({ where: { ID_Checador: id } });
    if (!checador) return res.redirect('/checadores');

    // No borrar si tiene historial: desactivar en su lugar (preserva trazabilidad)
    const historialCount = await prisma.historial_Checadas.count({ where: { ID_Checador: id } });
    if (historialCount > 0) {
      await prisma.checadores.update({ where: { ID_Checador: id }, data: { Activo: false } });
      req.flash('warning', `Checador con ${historialCount} checadas registradas: desactivado en lugar de eliminado`);
      return res.redirect('/checadores');
    }

    await prisma.checadores.delete({ where: { ID_Checador: id } });
    await registrarCambio({
      usuario: req.user, accion: 'DELETE', tabla: 'Checadores',
      idRegistro: id.toString(), descripcion: `Eliminación de checador ${checador.Nombre}`,
      datosPrevios: { Serial_Number: checador.Serial_Number, Nombre: checador.Nombre }, ip: obtenerIP(req)
    });
    req.flash('success', 'Checador eliminado');
    res.redirect('/checadores');
  } catch (error) {
    next(error);
  }
};

// ============================================================
// APROBACIÓN DE DEVICES AUTO-DESCUBIERTOS
// ============================================================

export const pendientes = async (req, res, next) => {
  try {
    const [pendientes, plantas] = await Promise.all([
      prisma.checadores.findMany({
        where: { Estado_Registro: 'pendiente_aprobacion' },
        orderBy: { CreatedAt: 'desc' }
      }),
      prisma.cat_Plantas.findMany({ where: { Activo: true }, orderBy: { Nombre: 'asc' } })
    ]);
    res.render('checadores/pendientes', { title: 'Checadores Pendientes', pendientes, plantas });
  } catch (error) {
    next(error);
  }
};

export const aprobar = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { Nombre, ID_Planta, Ubicacion_Codigo } = req.body;

    await prisma.checadores.update({
      where: { ID_Checador: id },
      data: {
        Nombre: Nombre ? String(Nombre).trim() : undefined,
        ID_Planta: ID_Planta ? parseInt(ID_Planta) : undefined,
        Ubicacion_Codigo: Ubicacion_Codigo ? String(Ubicacion_Codigo).trim().toUpperCase() : undefined,
        Estado_Registro: 'aprobado',
        Activo: true
      }
    });

    await registrarCambio({
      usuario: req.user, accion: 'UPDATE', tabla: 'Checadores',
      idRegistro: id.toString(), descripcion: `Aprobación de checador auto-descubierto`,
      ip: obtenerIP(req)
    });

    req.flash('success', 'Checador aprobado y activado');
    res.redirect('/checadores');
  } catch (error) {
    next(error);
  }
};

export const rechazar = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.checadores.delete({ where: { ID_Checador: id } });
    req.flash('success', 'Checador rechazado y eliminado');
    res.redirect('/checadores/pendientes');
  } catch (error) {
    next(error);
  }
};

// ============================================================
// DIAGNÓSTICO POR CHECADOR
// ============================================================

export const diagnostico = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const checador = await prisma.checadores.findUnique({
      where: { ID_Checador: id },
      include: { planta: { select: { Nombre: true } } }
    });
    if (!checador) return res.status(404).render('errors/404', { title: 'No encontrado', message: 'Checador no existe' });

    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [ultimaChecada, comandosPendientes, logs24h, latencia] = await Promise.all([
      prisma.historial_Checadas.findFirst({
        where: { ID_Checador: id },
        orderBy: { Fecha_Hora: 'desc' },
        include: { asistencia: { select: { ID_Empleado: true } } }
      }),
      prisma.checadores_Comandos.count({ where: { ID_Checador: id, Estatus: 'pendiente' } }),
      prisma.aDMS_Logs.count({ where: { SN: checador.Serial_Number, Fecha: { gte: hace24h } } }),
      prisma.aDMS_Logs.aggregate({
        where: { SN: checador.Serial_Number, Fecha: { gte: hace24h }, Processing_Ms: { not: null } },
        _avg: { Processing_Ms: true }
      })
    ]);

    res.render('checadores/diagnostico', {
      title: `Diagnóstico: ${checador.Nombre}`,
      checador,
      ultimaChecada,
      comandosPendientes,
      logs24h,
      latenciaPromedio: latencia._avg.Processing_Ms ? Math.round(latencia._avg.Processing_Ms) : null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logs ADMS recientes de un checador (JSON). Para el box desplegable del diagnóstico.
 * GET /checadores/:id/logs?limit=50
 */
export const logsJson = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    const checador = await prisma.checadores.findUnique({
      where: { ID_Checador: id },
      select: { Serial_Number: true }
    });
    if (!checador) return res.status(404).json({ error: 'No encontrado' });

    const logs = await prisma.aDMS_Logs.findMany({
      where: { SN: checador.Serial_Number },
      orderBy: { Fecha: 'desc' },
      take: limit
    });

    res.json({
      sn: checador.Serial_Number,
      total: logs.length,
      logs: logs.map(l => ({
        fecha: l.Fecha,
        endpoint: l.Endpoint,
        code: l.Response_Code,
        ms: l.Processing_Ms,
        bytes: l.Body_Size,
        error: l.Error
      }))
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// SINCRONIZAR EMPLEADOS -> CHECADOR (cola CREATE_USER)
// ============================================================

export const sincronizar = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { encolados, checadores } = await sincronizarTodos(id);
    if (checadores === 0) {
      req.flash('error', 'El checador no está activo/aprobado, no se sincronizó');
    } else {
      req.flash('success', `${encolados} empleado(s) encolados para sincronizar. El device los recogerá en su próximo polling.`);
    }
    res.redirect(`/checadores/${id}/diagnostico`);
  } catch (error) {
    next(error);
  }
};

export const forzarSetTime = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const checador = await prisma.checadores.findUnique({ where: { ID_Checador: id } });
    if (!checador) return res.redirect('/checadores');

    // Eliminar SET_TIME pendientes anteriores para forzar uno nuevo
    await prisma.checadores_Comandos.deleteMany({
      where: { ID_Checador: id, Tipo_Comando: 'SET_TIME', Estatus: { in: ['pendiente', 'enviado'] } }
    });

    const { fecha: fechaStr, hora: horaStr } = horaLocalDevice();

    await prisma.checadores_Comandos.create({
      data: {
        ID_Checador: id,
        Tipo_Comando: 'SET_TIME',
        Comando: `SET OPTIONS DateTime=${fechaStr} ${horaStr}`
      }
    });

    req.flash('success', `SET_TIME encolado: ${fechaStr} ${horaStr} (hora México). El device lo aplicará en su próximo polling.`);
    res.redirect(`/checadores/${id}/diagnostico`);
  } catch (error) {
    next(error);
  }
};

export const sincronizarGlobal = async (req, res, next) => {
  try {
    const { encolados, checadores } = await sincronizarTodos(null);
    if (checadores === 0) {
      req.flash('error', 'No hay checadores activos/aprobados');
    } else {
      req.flash('success', `Sincronización global: ${encolados} empleado(s) encolados en ${checadores} checador(es).`);
    }
    res.redirect('/checadores');
  } catch (error) {
    next(error);
  }
};

// ============================================================
// CHECADAS HUÉRFANAS (PIN no resuelto)
// ============================================================

export const huerfanas = async (req, res, next) => {
  try {
    const [huerfanas, empleados] = await Promise.all([
      prisma.checadas_Huerfanas.findMany({
        where: { Resuelto: false },
        orderBy: { Fecha_Creacion: 'desc' },
        take: 200
      }),
      prisma.empleados.findMany({
        where: { ID_Estatus: 1 },
        select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true },
        orderBy: { Nombre: 'asc' }
      })
    ]);
    res.render('checadores/huerfanas', { title: 'Checadas Huérfanas', huerfanas, empleados });
  } catch (error) {
    next(error);
  }
};

export const resolverHuerfana = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const idEmpleado = parseInt(req.body.ID_Empleado);
    await prisma.checadas_Huerfanas.update({
      where: { ID_Huerfana: id },
      data: { Resuelto: true, ID_Empleado_Resuelto: isNaN(idEmpleado) ? null : idEmpleado }
    });
    req.flash('success', 'Checada huérfana marcada como resuelta');
    res.redirect('/checadores/huerfanas');
  } catch (error) {
    next(error);
  }
};

// ============================================================
// PLANTAS (alta rápida)
// ============================================================

export const plantasIndex = async (req, res, next) => {
  try {
    const plantas = await prisma.cat_Plantas.findMany({
      include: { _count: { select: { checadores: true } } },
      orderBy: { Nombre: 'asc' }
    });
    res.render('checadores/plantas', { title: 'Plantas', plantas });
  } catch (error) {
    next(error);
  }
};

export const plantaStore = async (req, res, next) => {
  try {
    const { Nombre, Direccion } = req.body;
    await prisma.cat_Plantas.create({
      data: { Nombre: String(Nombre).trim(), Direccion: Direccion || null }
    });
    req.flash('success', 'Planta creada');
    res.redirect('/checadores/plantas');
  } catch (error) {
    if (error.code === 'P2002') {
      req.flash('error', 'Ya existe una planta con ese nombre');
      return res.redirect('/checadores/plantas');
    }
    next(error);
  }
};

export const plantaUpdate = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { Nombre, Direccion } = req.body;
    await prisma.cat_Plantas.update({
      where: { ID_Planta: id },
      data: { Nombre: String(Nombre).trim(), Direccion: Direccion || null }
    });
    await registrarCambio({
      usuario: req.user, accion: 'UPDATE', tabla: 'Cat_Plantas',
      idRegistro: id.toString(), descripcion: `Planta renombrada a: ${Nombre}`,
      ip: obtenerIP(req)
    });
    req.flash('success', 'Planta actualizada');
    res.redirect('/checadores/plantas');
  } catch (error) {
    if (error.code === 'P2002') {
      req.flash('error', 'Ya existe una planta con ese nombre');
      return res.redirect('/checadores/plantas');
    }
    next(error);
  }
};

export default {
  index, crear, store, editar, update, destroy,
  pendientes, aprobar, rechazar,
  diagnostico, logsJson, sincronizar, sincronizarGlobal, forzarSetTime, huerfanas, resolverHuerfana,
  plantasIndex, plantaStore, plantaUpdate
};
