/**
 * Rutas de administración de Checadores y Plantas (módulo ADMS).
 * Protegidas para Administrador / SuperAdministrador.
 *
 * Separadas del /checador legacy (import XLSX) — éstas viven en /checadores.
 */

import { Router } from 'express';
import { isAuthenticated, isAdmin } from '../middleware/auth.js';
import * as ctrl from '../controllers/checadoresAdminController.js';

const router = Router();
router.use(isAuthenticated, isAdmin);

// Listado principal
router.get('/', ctrl.index);

// Sincronización global (todos los checadores)
router.post('/sincronizar-global', ctrl.sincronizarGlobal);

// Pendientes de aprobación (auto-discovery)
router.get('/pendientes', ctrl.pendientes);
router.post('/:id/aprobar', ctrl.aprobar);
router.post('/:id/rechazar', ctrl.rechazar);

// Huérfanas
router.get('/huerfanas', ctrl.huerfanas);
router.post('/huerfanas/:id/resolver', ctrl.resolverHuerfana);

// Plantas
router.get('/plantas', ctrl.plantasIndex);
router.post('/plantas', ctrl.plantaStore);
router.post('/plantas/:id', ctrl.plantaUpdate);

// CRUD checador
router.get('/crear', ctrl.crear);
router.post('/', ctrl.store);
router.get('/:id/diagnostico', ctrl.diagnostico);
router.get('/:id/logs', ctrl.logsJson);
router.post('/:id/sincronizar', ctrl.sincronizar);
router.get('/:id/editar', ctrl.editar);
router.put('/:id', ctrl.update);
router.post('/:id', ctrl.update);
router.delete('/:id', ctrl.destroy);
router.post('/:id/eliminar', ctrl.destroy);

export default router;
