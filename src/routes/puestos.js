import { Router } from 'express';
import * as puestosController from '../controllers/puestosController.js';
import { isAuthenticated, isAdmin } from '../middleware/auth.js';

const router = Router();

// ============================================================
// RUTAS DE PUESTOS
// ============================================================

// Aplicar autenticación a todas las rutas
router.use(isAuthenticated);

// GET /puestos - Listar todos los puestos
router.get('/', puestosController.index);

// GET /puestos/crear - Mostrar formulario de creación
router.get('/crear', isAdmin, puestosController.crear);

// POST /puestos - Guardar nuevo puesto
router.post('/', isAdmin, puestosController.store);

// GET /puestos/:id/editar - Mostrar formulario de edición
router.get('/:id/editar', isAdmin, puestosController.editar);

// PUT /puestos/:id - Actualizar puesto
router.put('/:id', isAdmin, puestosController.update);

// POST /puestos/:id - Actualizar puesto (alternativa para formularios HTML)
router.post('/:id', isAdmin, puestosController.update);

// DELETE /puestos/:id - Eliminar puesto
router.delete('/:id', isAdmin, puestosController.destroy);

// POST /puestos/:id/eliminar - Eliminar puesto (alternativa para formularios HTML)
router.post('/:id/eliminar', isAdmin, puestosController.destroy);

// API: Obtener puestos por área
router.get('/api/por-area/:areaId', puestosController.getPuestosByArea);

export default router;
