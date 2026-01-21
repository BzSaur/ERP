import { Router } from 'express';
import * as areasController from '../controllers/areasController.js';
import { isAuthenticated, isAdmin } from '../middleware/auth.js';

const router = Router();

// ============================================================
// RUTAS DE ÁREAS
// ============================================================

// Aplicar autenticación a todas las rutas
router.use(isAuthenticated);

// GET /areas - Listar todas las áreas
router.get('/', areasController.index);

// GET /areas/crear - Mostrar formulario de creación
router.get('/crear', isAdmin, areasController.crear);

// POST /areas - Guardar nueva área
router.post('/', isAdmin, areasController.store);

// GET /areas/:id/editar - Mostrar formulario de edición
router.get('/:id/editar', isAdmin, areasController.editar);

// PUT /areas/:id - Actualizar área
router.put('/:id', isAdmin, areasController.update);

// POST /areas/:id - Actualizar área (alternativa para formularios HTML)
router.post('/:id', isAdmin, areasController.update);

// DELETE /areas/:id - Eliminar área
router.delete('/:id', isAdmin, areasController.destroy);

// POST /areas/:id/eliminar - Eliminar área (alternativa para formularios HTML)
router.post('/:id/eliminar', isAdmin, areasController.destroy);

export default router;
