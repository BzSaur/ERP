/**
 * Rutas de Catálogos del Sistema
 * Agrupa: Áreas, Puestos, Horarios, Nacionalidades
 */

import { Router } from 'express';
import { isAuthenticated, isAdminOrRH } from '../middleware/auth.js';

// Importar controllers existentes (no se mueven de lugar)
import * as areasController from '../controllers/areasController.js';
import * as puestosController from '../controllers/puestosController.js';
import * as horariosController from '../controllers/horariosController.js';
import * as nacionalidadesController from '../controllers/nacionalidadesController.js';

const router = Router();
router.use(isAuthenticated);

// ============================================================
// RUTAS DE ÁREAS
// ============================================================

router.get('/areas', areasController.index);
router.get('/areas/crear', isAdminOrRH, areasController.crear);
router.post('/areas', isAdminOrRH, areasController.store);
router.get('/areas/:id/editar', isAdminOrRH, areasController.editar);
router.put('/areas/:id', isAdminOrRH, areasController.update);
router.post('/areas/:id', isAdminOrRH, areasController.update);
router.delete('/areas/:id', isAdminOrRH, areasController.destroy);
router.post('/areas/:id/eliminar', isAdminOrRH, areasController.destroy);

// ============================================================
// RUTAS DE PUESTOS
// ============================================================

router.get('/puestos', puestosController.index);
router.get('/puestos/crear', isAdminOrRH, puestosController.crear);
router.post('/puestos', isAdminOrRH, puestosController.store);
router.get('/puestos/:id/editar', isAdminOrRH, puestosController.editar);
router.put('/puestos/:id', isAdminOrRH, puestosController.update);
router.post('/puestos/:id', isAdminOrRH, puestosController.update);
router.delete('/puestos/:id', isAdminOrRH, puestosController.destroy);
router.post('/puestos/:id/eliminar', isAdminOrRH, puestosController.destroy);

// API: Obtener puestos por área
router.get('/puestos/api/por-area/:areaId', puestosController.getPuestosByArea);

// ============================================================
// RUTAS DE HORARIOS
// ============================================================

router.get('/horarios', horariosController.index);
router.get('/horarios/crear', isAdminOrRH, horariosController.crear);
router.post('/horarios', isAdminOrRH, horariosController.store);
router.get('/horarios/:id/editar', isAdminOrRH, horariosController.editar);
router.put('/horarios/:id', isAdminOrRH, horariosController.update);
router.delete('/horarios/:id', isAdminOrRH, horariosController.eliminar);

// ============================================================
// RUTAS DE NACIONALIDADES
// ============================================================

router.get('/nacionalidades', nacionalidadesController.index);
router.get('/nacionalidades/crear', isAdminOrRH, nacionalidadesController.crear);
router.post('/nacionalidades', isAdminOrRH, nacionalidadesController.store);
router.get('/nacionalidades/:id/editar', isAdminOrRH, nacionalidadesController.editar);
router.put('/nacionalidades/:id', isAdminOrRH, nacionalidadesController.update);
router.delete('/nacionalidades/:id', isAdminOrRH, nacionalidadesController.eliminar);

export default router;
