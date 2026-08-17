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

// Las recurrencias ya no tienen pantalla propia: se crean y detienen desde el
// calendario de /encargado (toggle con modo RECURRENTE).

// Asistencia del propio equipo (tabla real acotada, autoservicio del encargado)
router.get('/asistencia', isEncargado, asistenciaEncargadoController.horasEquipo);
router.get('/asistencia/excel', isEncargado, asistenciaEncargadoController.horasEquipoExcel);
router.get('/asistencia/dia', isEncargado, asistenciaEncargadoController.detalleDia);

// Actividades. Crear es autoservicio del encargado (dueño = req.user.ID_Empleado);
// ver/agregar/quitar asignación permiten además supervisión de ADMIN/RH/SUPER_ADMIN
// (el controller valida ID_Responsable === req.user.ID_Empleado o esSupervisor()).
router.get('/', actividadesController.index);
router.post('/actividades/toggle', isEncargado, actividadesController.toggleCelda);
router.get('/actividades/crear', isEncargado, actividadesController.crear);
router.post('/actividades', isEncargado, actividadesController.store);
router.get('/actividades/:id', actividadesController.ver);
router.post('/actividades/:id/asignaciones', actividadesController.agregarAsignacion);
router.post('/actividades/:id/asignaciones/:idAsignacion/eliminar', actividadesController.quitarAsignacion);

export default router;
