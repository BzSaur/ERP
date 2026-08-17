/**
 * Tabla de asistencia acotada al equipo del encargado (o de un encargado
 * elegido, si SuperAdmin delega). Reutiliza la vista real /asistencia/horas
 * y el mismo servicio que la tabla global, filtrando por idsPermitidos.
 */

import prisma from '../config/database.js';
import * as asistenciaService from '../services/asistenciaService.js';
import * as nominaService from '../services/nominaService.js';
import { generarExcelHoras } from '../services/excelHorasService.js';
import { obtenerEquipoVigente, empleadoEnEquipoDeEncargado } from '../services/gruposService.js';

const normalizeRole = (roleName) => (roleName || '').toUpperCase().replace(/\s+/g, '_');

// SuperAdmin puro: elige de qué encargado ver el equipo (no tiene equipo propio).
function esSuperAdminDelegante(user) {
  return ['SUPER_ADMIN', 'SUPERADMINISTRADOR'].includes(normalizeRole(user?.rol?.Nombre_Rol));
}

// ID_Empleado del encargado cuyo equipo se está viendo: el elegido en el
// <select> si es SuperAdmin, o el propio usuario si es ENCARGADO.
function resolverEncargadoEfectivo(req) {
  if (esSuperAdminDelegante(req.user)) {
    const submitted = parseInt(req.query?.encargado ?? req.query?.ID_Encargado_Empleado);
    return Number.isInteger(submitted) ? submitted : null;
  }
  return req.user.ID_Empleado ?? null;
}

function listarEncargados() {
  return prisma.cat_Encargados.findMany({
    where: { Activo: true },
    include: { empleado: { select: { ID_Empleado: true, Nombre: true, Apellido_Paterno: true, Apellido_Materno: true } } },
    orderBy: { empleado: { Nombre: 'asc' } }
  });
}

const DATOS_VACIOS = (inicio, fin) => ({
  filas: [], fechas: [], plantas: [], revisiones: [], totalRevisiones: 0,
  actividades: [], totalActividades: 0, periodo: { fechaInicio: inicio, fechaFin: fin }
});

// GET /encargado/asistencia
export const horasEquipo = async (req, res, next) => {
  try {
    const esDelegante = esSuperAdminDelegante(req.user);
    let miId = resolverEncargadoEfectivo(req);

    const { fechaInicio, fechaFin, redondear } = req.query;
    const semana = nominaService.getSemanaActual();
    const inicio = fechaInicio ? new Date(`${fechaInicio}T00:00:00`) : semana.lunes;
    const fin = fechaFin ? new Date(`${fechaFin}T00:00:00`) : semana.sabado;

    // SuperAdmin sin encargado elegido: solo el selector, sin reporte crudo.
    if (!miId) {
      if (esDelegante) {
        const encargadosDisponibles = await listarEncargados();
        // Con un solo encargado no tiene sentido pedir que elija: se asume.
        if (encargadosDisponibles.length === 1) {
          miId = encargadosDisponibles[0].empleado.ID_Empleado;
        } else {
          return res.render('asistencia/horas-todos', {
            title: 'Asistencia por Encargado',
            datos: DATOS_VACIOS(inicio, fin),
            fechaInicio: inicio.toISOString().split('T')[0],
            fechaFin: fin.toISOString().split('T')[0],
            redondear: redondear === '1',
            excelUrl: '/encargado/asistencia/excel',
            panelEditable: false,
            esSupervisorParaDelegar: true,
            encargadosDisponibles,
            idEncargadoPreseleccionado: null,
            user: req.user
          });
        }
      } else {
        req.flash('error', 'Tu usuario no está vinculado a un empleado.');
        return res.redirect('/');
      }
    }

    const equipo = await obtenerEquipoVigente(miId);
    const idsPermitidos = equipo.map(e => e.ID_Empleado);

    const datos = idsPermitidos.length
      ? await asistenciaService.obtenerHorasSemanalTodos(inicio, fin, { idsPermitidos })
      : DATOS_VACIOS(inicio, fin);

    res.render('asistencia/horas-todos', {
      title: esDelegante ? 'Asistencia por Encargado' : 'Asistencia de mi Equipo',
      datos,
      fechaInicio: inicio.toISOString().split('T')[0],
      fechaFin: fin.toISOString().split('T')[0],
      redondear: redondear === '1',
      excelUrl: '/encargado/asistencia/excel',
      // Habilita el panel lateral de edición al hacer clic en una celda.
      panelEditable: true,
      esSupervisorParaDelegar: esDelegante,
      encargadosDisponibles: esDelegante ? await listarEncargados() : [],
      idEncargadoPreseleccionado: miId,
      user: req.user
    });
  } catch (error) {
    next(error);
  }
};

// GET /encargado/asistencia/excel
export const horasEquipoExcel = async (req, res, next) => {
  try {
    const miId = resolverEncargadoEfectivo(req);
    if (!miId) {
      // Sin encargado resuelto no hay equipo que exportar (SuperAdmin debe elegir).
      req.flash('error', 'Elige un encargado antes de descargar el reporte.');
      return res.redirect('/encargado/asistencia');
    }

    const { fechaInicio, fechaFin, sort, dir, redondear } = req.query;
    const semana = nominaService.getSemanaActual();
    const inicio = fechaInicio ? new Date(`${fechaInicio}T00:00:00`) : semana.lunes;
    const fin = fechaFin ? new Date(`${fechaFin}T00:00:00`) : semana.sabado;

    const equipo = await obtenerEquipoVigente(miId);
    const idsPermitidos = equipo.map(e => e.ID_Empleado);

    const buffer = await generarExcelHoras(inicio, fin, {
      sort, dir, redondear: redondear === '1',
      filtro: { idsPermitidos: idsPermitidos.length ? idsPermitidos : [-1] }
    });

    const f1 = inicio.toISOString().slice(0, 10);
    const f2 = fin.toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="horas_equipo_${f1}_a_${f2}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

// GET /encargado/asistencia/dia?empleado=X&fecha=yyyy-mm-dd
// Detalle de un día para el panel lateral: checadas reales, actividad
// delegada vigente y ausencia justificada, más los catálogos para editarla.
export const detalleDia = async (req, res, next) => {
  try {
    const miId = resolverEncargadoEfectivo(req);
    if (!miId) return res.status(400).json({ ok: false, error: 'Selecciona un encargado responsable' });

    const idEmpleado = parseInt(req.query.empleado);
    const fechaStr = (req.query.fecha || '').trim();
    if (!Number.isInteger(idEmpleado) || !/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
      return res.status(400).json({ ok: false, error: 'Empleado o fecha inválidos' });
    }
    const fecha = new Date(`${fechaStr}T00:00:00`);

    if (!(await empleadoEnEquipoDeEncargado(idEmpleado, miId, fecha))) {
      return res.status(403).json({ ok: false, error: 'Ese empleado no pertenece a tu equipo vigente esa fecha' });
    }

    const [empleado, asistencia, actividadesMap, ausencias, tiposActividad, empresas] = await Promise.all([
      prisma.empleados.findUnique({
        where: { ID_Empleado: idEmpleado },
        select: { Nombre: true, Apellido_Paterno: true, Apellido_Materno: true, area: { select: { Nombre_Area: true } } }
      }),
      prisma.empleados_Asistencia.findFirst({
        where: { ID_Empleado: idEmpleado, Fecha: fecha },
        select: {
          Presente: true, Hora_Entrada: true, Hora_Salida: true, Horas_Trabajadas: true,
          Minutos_Retardo: true, Ubicacion_Entrada: true, Ubicacion_Salida: true,
          historial_checadas: {
            orderBy: { Fecha_Hora: 'asc' },
            select: { Fecha_Hora: true, Tipo_Checada: true, Ubicacion: true }
          }
        }
      }),
      asistenciaService.resolverActividadesPorRango([idEmpleado], fecha, fecha),
      asistenciaService.obtenerAusenciasJustificadas(fecha, fecha, idEmpleado),
      prisma.cat_Tipo_Actividad.findMany({ where: { Activo: true }, orderBy: { Nombre: 'asc' } }),
      prisma.cat_Empresas.findMany({ where: { Activo: true }, orderBy: { Nombre_Empresa: 'asc' } })
    ]);

    const actividad = actividadesMap.get(`${idEmpleado}_${fechaStr}`) || null;
    const periodoAus = asistenciaService.periodoAusenciaEnFecha(ausencias, idEmpleado, fecha);
    const gana = asistenciaService.ganadorDelDia(periodoAus, actividad);

    const fmtHora = (d) => d ? new Date(d).toTimeString().slice(0, 5) : null;

    res.json({
      ok: true,
      empleado: {
        ID_Empleado: idEmpleado,
        nombre: [empleado?.Nombre, empleado?.Apellido_Paterno, empleado?.Apellido_Materno].filter(Boolean).join(' '),
        area: empleado?.area?.Nombre_Area || ''
      },
      fecha: fechaStr,
      esDomingo: fecha.getDay() === 0,
      asistencia: asistencia ? {
        presente: asistencia.Presente,
        entrada: fmtHora(asistencia.Hora_Entrada),
        salida: fmtHora(asistencia.Hora_Salida),
        horas: Number(asistencia.Horas_Trabajadas) || 0,
        minutosRetardo: asistencia.Minutos_Retardo || 0,
        plantaEntrada: asistencia.Ubicacion_Entrada || null,
        checadas: asistencia.historial_checadas.map(c => ({
          hora: fmtHora(c.Fecha_Hora), tipo: c.Tipo_Checada, planta: c.Ubicacion || null
        }))
      } : null,
      actividad,
      ausencia: periodoAus ? { etiqueta: periodoAus.etiqueta } : null,
      // Cuál de las dos manda hoy (la asignada al último).
      ganador: gana,
      tiposActividad,
      empresas
    });
  } catch (error) {
    next(error);
  }
};

export default { horasEquipo, horasEquipoExcel, detalleDia };
