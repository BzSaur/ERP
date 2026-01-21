/**
 * Rutas de Horarios
 */

import { Router } from 'express';
import * as horariosController from '../controllers/horariosController.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = Router();

// Aplicar middleware de autenticación
router.use(isAuthenticated);

// Listar horarios
router.get('/', horariosController.index);

// Formulario crear
router.get('/crear', horariosController.crear);

// Guardar nuevo horario
router.post('/', horariosController.store);

// Formulario editar
router.get('/:id/editar', horariosController.editar);

// Actualizar horario
router.put('/:id', horariosController.update);

// Eliminar horario
router.delete('/:id', horariosController.eliminar);

export default router;
