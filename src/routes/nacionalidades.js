/**
 * Rutas de Nacionalidades
 */

import { Router } from 'express';
import * as nacionalidadesController from '../controllers/nacionalidadesController.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = Router();

// Aplicar middleware de autenticación
router.use(isAuthenticated);

// Listar nacionalidades
router.get('/', nacionalidadesController.index);

// Formulario crear
router.get('/crear', nacionalidadesController.crear);

// Guardar nueva nacionalidad
router.post('/', nacionalidadesController.store);

// Formulario editar
router.get('/:id/editar', nacionalidadesController.editar);

// Actualizar nacionalidad
router.put('/:id', nacionalidadesController.update);

// Eliminar nacionalidad
router.delete('/:id', nacionalidadesController.eliminar);

export default router;
