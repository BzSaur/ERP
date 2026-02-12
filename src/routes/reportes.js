import { Router } from 'express';
import * as reportesController from '../controllers/reportesController.js';
import { isAuthenticated, isAdminOrRH } from '../middleware/auth.js';

const router = Router();

// ============================================================
// RUTAS DE REPORTES (Solo ADMIN/RH)
// ============================================================

// Aplicar autenticación + ADMIN/RH a todas las rutas
router.use(isAuthenticated);
router.use(isAdminOrRH);

// GET /reportes - Dashboard de reportes
router.get('/', reportesController.index);

// GET /reportes/por-area - Reporte por área
router.get('/por-area', reportesController.porArea);

// GET /reportes/por-horario - Reporte por tipo de horario
router.get('/por-horario', reportesController.porHorario);

// GET /reportes/por-estatus - Reporte por estatus
router.get('/por-estatus', reportesController.porEstatus);

// GET /reportes/altas-bajas - Reporte de altas y bajas
router.get('/altas-bajas', reportesController.altasBajas);

export default router;
