/**
 * Rutas de administración SuperAdmin: Grupos, Encargados, Recurrencias, Tipos de Actividad.
 */

import { Router } from 'express';
import * as gruposController from '../controllers/gruposController.js';
import * as encargadosController from '../controllers/encargadosController.js';
import * as tiposActividadController from '../controllers/tiposActividadController.js';
import { isAuthenticated, isSuperAdmin } from '../middleware/auth.js';

const router = Router();

router.use(isAuthenticated);
router.use(isSuperAdmin);

// Grupos
router.get('/grupos', gruposController.index);
router.get('/grupos/wizard', gruposController.wizard);
router.post('/grupos/wizard', gruposController.wizardStore);
router.get('/grupos/crear', gruposController.crear);
router.post('/grupos', gruposController.store);
router.get('/grupos/:id/editar', gruposController.editar);
router.put('/grupos/:id', gruposController.update);
router.post('/grupos/:id', gruposController.update);
router.delete('/grupos/:id', gruposController.destroy);
router.post('/grupos/:id/eliminar', gruposController.destroy);
router.post('/grupos/:id/miembros', gruposController.agregarMiembro);
router.put('/grupos/:id/miembros/:idMiembro', gruposController.editarMiembro);
router.post('/grupos/:id/miembros/:idMiembro', gruposController.editarMiembro);
router.post('/grupos/:id/miembros/:idMiembro/eliminar', gruposController.quitarMiembro);
router.post('/grupos/:id/recurrencias/toggle', gruposController.toggleRecurrencia);

// Encargados
router.get('/encargados', encargadosController.index);
router.get('/encargados/crear', encargadosController.crear);
router.post('/encargados', encargadosController.store);
router.post('/encargados/:id/eliminar', encargadosController.destroy);

// Las recurrencias se gestionan desde el calendario de /encargado y desde la
// matriz de /admin/grupos/:id/editar — ya no tienen listado/form propios.

// Tipos de Actividad (catálogo abierto)
router.get('/tipos-actividad', tiposActividadController.index);
router.get('/tipos-actividad/crear', tiposActividadController.crear);
router.post('/tipos-actividad', tiposActividadController.store);
router.get('/tipos-actividad/:id/editar', tiposActividadController.editar);
router.put('/tipos-actividad/:id', tiposActividadController.update);
router.post('/tipos-actividad/:id', tiposActividadController.update);
router.delete('/tipos-actividad/:id', tiposActividadController.destroy);
router.post('/tipos-actividad/:id/eliminar', tiposActividadController.destroy);

export default router;
