import { Router } from 'express';
import * as reportesController from '../controllers/reportesController.js';
import { isAuthenticated, isAdminOrRH, canView } from '../middleware/auth.js';

const router = Router();

// ============================================================
// RUTAS DE REPORTES
// ============================================================

router.use(isAuthenticated);

// GET /reportes - Dashboard de reportes (ADMIN/RH)
router.get('/', isAdminOrRH, reportesController.index);

// GET /reportes/por-area - Reporte por área (lectura: ADMIN/RH/CONSULTA)
router.get('/por-area', canView, reportesController.porArea);

// GET /reportes/por-horario - Reporte por tipo de horario (ADMIN/RH)
router.get('/por-horario', isAdminOrRH, reportesController.porHorario);

// GET /reportes/por-estatus - Reporte por estatus (ADMIN/RH)
router.get('/por-estatus', isAdminOrRH, reportesController.porEstatus);

// GET /reportes/altas-bajas - Reporte de altas y bajas (ADMIN/RH)
router.get('/altas-bajas', isAdminOrRH, reportesController.altasBajas);

export default router;
