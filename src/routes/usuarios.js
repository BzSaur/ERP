import { Router } from 'express';
import * as usuariosController from '../controllers/usuariosController.js';
import { isAuthenticated, isSuperAdmin } from '../middleware/auth.js';

const router = Router();

// Todas las rutas requieren autenticación + rol SUPER_ADMIN únicamente
router.use(isAuthenticated);
router.use(isSuperAdmin);

// GET /usuarios - Listar usuarios
router.get('/', usuariosController.index);

// GET /usuarios/crear - Formulario crear usuario
router.get('/crear', usuariosController.crear);

// POST /usuarios - Guardar nuevo usuario
router.post('/', usuariosController.store);

// GET /usuarios/:id/editar - Formulario editar usuario
router.get('/:id/editar', usuariosController.editar);

// POST /usuarios/:id - Actualizar usuario
router.post('/:id', usuariosController.update);

// POST /usuarios/:id/eliminar - Eliminar usuario
router.post('/:id/eliminar', usuariosController.eliminar);

// POST /usuarios/:id/toggle-activo - Activar/Desactivar usuario
router.post('/:id/toggle-activo', usuariosController.toggleActivo);

export default router;
