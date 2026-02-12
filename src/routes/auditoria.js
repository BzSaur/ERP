/**
 * Rutas de Auditoría - RAM ERP
 * Historial de cambios para SUPER_ADMIN
 */

import express from 'express';
import * as auditoriaController from '../controllers/auditoriaController.js';
import { isAuthenticated, isSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

// Todas las rutas de auditoría requieren ser SUPER_ADMIN
router.use(isAuthenticated);
router.use(isSuperAdmin);

// Vista principal del historial
router.get('/', auditoriaController.index);

// Detalle de un cambio específico
router.get('/:id', auditoriaController.detalle);

// Exportar a CSV
router.get('/exportar', auditoriaController.exportarCSV);

export default router;
