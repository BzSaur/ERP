/**
 * Rutas de Finiquito/Liquidación
 */

import { Router } from 'express';
import * as finiquitoController from '../controllers/finiquitoController.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = Router();

// Aplicar middleware de autenticación
router.use(isAuthenticated);

// Listar finiquitos
router.get('/', finiquitoController.index);

// Formulario crear
router.get('/crear', finiquitoController.crear);

// Calcular y guardar
router.post('/', finiquitoController.calcular);

// Ver detalle
router.get('/:id', finiquitoController.ver);

// Aprobar
router.post('/:id/aprobar', finiquitoController.aprobar);

// Pagar
router.post('/:id/pagar', finiquitoController.pagar);

export default router;
