import { Router } from 'express';
import * as empleadosController from '../controllers/empleadosController.js';
import { isAuthenticated, isRH } from '../middleware/auth.js';

const router = Router();

// ============================================================
// RUTAS DE EMPLEADOS
// ============================================================

// Aplicar autenticación a todas las rutas
router.use(isAuthenticated);

// GET /empleados - Listar todos los empleados
router.get('/', empleadosController.index);

// GET /empleados/crear - Mostrar formulario de creación
router.get('/crear', isRH, empleadosController.crear);

// POST /empleados - Guardar nuevo empleado
router.post('/', isRH, empleadosController.store);

// GET /empleados/:id - Ver detalle de empleado
router.get('/:id', empleadosController.show);

// GET /empleados/:id/editar - Mostrar formulario de edición
router.get('/:id/editar', isRH, empleadosController.editar);

// PUT /empleados/:id - Actualizar empleado
router.put('/:id', isRH, empleadosController.update);

// POST /empleados/:id - Actualizar empleado (alternativa para formularios HTML)
router.post('/:id', isRH, empleadosController.update);

// DELETE /empleados/:id - Eliminar empleado
router.delete('/:id', isRH, empleadosController.destroy);

// POST /empleados/:id/eliminar - Eliminar empleado (alternativa para formularios HTML)
router.post('/:id/eliminar', isRH, empleadosController.destroy);

export default router;
