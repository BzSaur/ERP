/**
 * Rutas de Horas Adicionales
 */

import { Router } from 'express';
import * as horasAdicionalesController from '../controllers/horasAdicionalesController.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = Router();

// Aplicar middleware de autenticación
router.use(isAuthenticated);

// Listar horas adicionales
router.get('/', horasAdicionalesController.index);

// Formulario crear
router.get('/crear', horasAdicionalesController.crear);

// Guardar nuevas horas
router.post('/', horasAdicionalesController.store);

// Formulario editar
router.get('/:id/editar', horasAdicionalesController.editar);

// Actualizar horas
router.put('/:id', horasAdicionalesController.update);

// Aprobar horas
router.post('/:id/aprobar', horasAdicionalesController.aprobar);

// Eliminar horas
router.delete('/:id', horasAdicionalesController.eliminar);

export default router;
