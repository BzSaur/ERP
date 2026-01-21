import { Router } from 'express';
import * as usuariosController from '../controllers/usuariosController.js';
import { isAuthenticated, isAdmin } from '../middleware/auth.js';

const router = Router();

// ============================================================
// RUTAS DE USUARIOS DEL SISTEMA
// Todas las rutas requieren autenticación y rol de admin
// ============================================================

// Middleware para verificar que es admin o superadmin
router.use(isAuthenticated);

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
