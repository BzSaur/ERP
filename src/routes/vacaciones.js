/**
 * Rutas de Vacaciones
 */

import { Router } from 'express';
import * as vacacionesController from '../controllers/vacacionesController.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = Router();

// Aplicar middleware de autenticación
router.use(isAuthenticated);

// Listar vacaciones
router.get('/', vacacionesController.index);

// Elegibilidad de empleados
router.get('/elegibilidad', vacacionesController.elegibilidad);

// Generar vacaciones automáticas
router.post('/generar', vacacionesController.generarVacaciones);

// Formulario registrar vacaciones
router.get('/crear', vacacionesController.crear);

// Guardar vacaciones
router.post('/', vacacionesController.store);

// Aprobar vacaciones
router.post('/:id/aprobar', vacacionesController.aprobar);

export default router;
