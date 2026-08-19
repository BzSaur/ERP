/**
 * Rutas de Encargado / Actividades de Campo y Home Office
 * Delegación de asistencia por día para trabajo de campo/remoto (obra/cliente
 * externo, home office). Equipo y vigencias se gestionan vía Grupos
 * (ver gruposService.js) — no hay autoservicio de "mi equipo" aquí, eso lo
 * administra SuperAdmin en /admin/grupos.
 */

import { Router } from 'express';
import * as actividadesController from '../controllers/actividadesController.js';
import * as asistenciaEncargadoController from '../controllers/asistenciaEncargadoController.js';
import { isAuthenticated, isEncargado, canManageActividades } from '../middleware/auth.js';

const router = Router();

router.use(isAuthenticated);
router.use(canManageActividades); // base: ENCARGADO, ADMIN, RH, SUPER_ADMIN

// Recurrencias: se CREAN desde el calendario (toggle en modo RECURRENTE); esta
// pantalla es solo para corregir una regla existente (datos, días y vigencia).
router.get('/recurrencias/:id', actividadesController.verRecurrencia);
router.post('/recurrencias/:id', actividadesController.actualizarRecurrencia);
router.post('/recurrencias/:id/detener', actividadesController.detenerRecurrencia);

// Asistencia del propio equipo (tabla real acotada, autoservicio del encargado)
router.get('/asistencia', isEncargado, asistenciaEncargadoController.horasEquipo);
router.get('/asistencia/excel', isEncargado, asistenciaEncargadoController.horasEquipoExcel);
router.get('/asistencia/dia', isEncargado, asistenciaEncargadoController.detalleDia);

// Actividades. Crear es autoservicio del encargado (dueño = req.user.ID_Empleado);
// ver/agregar/quitar asignación permiten además supervisión de ADMIN/RH/SUPER_ADMIN
// (el controller valida ID_Responsable === req.user.ID_Empleado o esSupervisor()).
router.get('/', actividadesController.index);
router.post('/actividades/toggle', isEncargado, actividadesController.toggleCelda);
// Tramo horario de un día concreto, desde el panel lateral de asistencia.
router.post('/actividades/asignacion/:idAsignacion/horas-json', isEncargado, actividadesController.guardarHorasDiaJson);
router.get('/actividades/crear', isEncargado, actividadesController.crear);
router.post('/actividades', isEncargado, actividadesController.store);
router.get('/actividades/:id', actividadesController.ver);
router.post('/actividades/:id', actividadesController.actualizar);
router.post('/actividades/:id/eliminar', actividadesController.eliminar);
router.post('/actividades/:id/dias', actividadesController.guardarDias);
router.post('/actividades/:id/datos', actividadesController.actualizarDatosJson);
router.post('/actividades/:id/asignaciones', actividadesController.agregarAsignacion);
router.post('/actividades/:id/asignaciones/lote-eliminar', actividadesController.quitarAsignacionesLote);
router.post('/actividades/:id/asignaciones/:idAsignacion/horas', actividadesController.guardarHorasDia);
router.post('/actividades/:id/asignaciones/:idAsignacion/eliminar', actividadesController.quitarAsignacion);

export default router;
