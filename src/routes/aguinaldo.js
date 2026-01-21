/**
 * Rutas de Aguinaldo
 */

import { Router } from 'express';
import * as aguinaldoController from '../controllers/aguinaldoController.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = Router();

// Aplicar middleware de autenticación
router.use(isAuthenticated);

// Listar aguinaldos
router.get('/', aguinaldoController.index);

// Calcular aguinaldo para todos
router.post('/calcular', aguinaldoController.calcular);

// Pagar todos los pendientes
router.post('/pagar-todos', aguinaldoController.pagarTodos);

// Ver detalle
router.get('/:id', aguinaldoController.ver);

// Marcar como pagado
router.post('/:id/pagar', aguinaldoController.pagar);

export default router;
