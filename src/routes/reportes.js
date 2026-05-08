import { Router } from 'express';
import * as reportesController from '../controllers/reportesController.js';
import { isAuthenticated, isAdmin } from '../middleware/auth.js';

const router = Router();

// ============================================================
// RUTAS DE REPORTES (Solo ADMIN/RH)
// ============================================================
// Todos los roles autenticados pueden ver reportes
router.use(isAuthenticated);

router.get('/', reportesController.index);
router.get('/por-area', reportesController.porArea);
router.get('/por-horario', reportesController.porHorario);
router.get('/por-estatus', reportesController.porEstatus);
router.get('/altas-bajas', reportesController.altasBajas);

export default router;