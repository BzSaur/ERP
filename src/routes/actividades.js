/**
 * Rutas de Encargado / Actividades de Campo
 * Delegación de asistencia por día para trabajo de campo (obra/cliente externo)
 */

import { Router } from 'express';
import * as actividadesController from '../controllers/actividadesController.js';
import { isAuthenticated, isEncargado, canManageActividades } from '../middleware/auth.js';

const router = Router();

router.use(isAuthenticated);
router.use(canManageActividades); // base: ENCARGADO, ADMIN, RH, SUPER_ADMIN

// Mi equipo (autoservicio del encargado)
router.get('/equipo', isEncargado, actividadesController.equipo);
router.post('/equipo', isEncargado, actividadesController.agregarSubordinado);
router.post('/equipo/:idSubordinado/eliminar', isEncargado, actividadesController.quitarSubordinado);

// Actividades. Crear es autoservicio del encargado (dueño = req.user.ID_Empleado);
// ver/agregar/quitar asignación permiten además supervisión de ADMIN/RH/SUPER_ADMIN
// (el controller valida ID_Responsable === req.user.ID_Empleado o esSupervisor()).
router.get('/', actividadesController.index);
router.get('/actividades/crear', isEncargado, actividadesController.crear);
router.post('/actividades', isEncargado, actividadesController.store);
router.get('/actividades/:id', actividadesController.ver);
router.post('/actividades/:id/asignaciones', actividadesController.agregarAsignacion);
router.post('/actividades/:id/asignaciones/:idAsignacion/eliminar', actividadesController.quitarAsignacion);

export default router;
