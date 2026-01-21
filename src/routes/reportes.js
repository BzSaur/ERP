import { Router } from 'express';
import * as reportesController from '../controllers/reportesController.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = Router();

// ============================================================
// RUTAS DE REPORTES
// ============================================================

// Aplicar autenticación a todas las rutas
router.use(isAuthenticated);

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
