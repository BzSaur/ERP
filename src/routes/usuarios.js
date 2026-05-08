import { Router } from 'express';
import * as usuariosController from '../controllers/usuariosController.js';
import { isAuthenticated, isSuperAdmin, isAdmin } from '../middleware/auth.js';


const router = Router();

// Todas las rutas requieren autenticación + rol SUPER_ADMIN únicamente
router.use(isAuthenticated);

// ADMIN y SUPER_ADMIN pueden ver
router.get('/', isAdmin, usuariosController.index);

// Solo SUPER_ADMIN puede escribir
router.get('/crear', isSuperAdmin, usuariosController.crear);
router.post('/', isSuperAdmin, usuariosController.store);
router.get('/:id/editar', isSuperAdmin, usuariosController.editar);
router.post('/:id', isSuperAdmin, usuariosController.update);
router.post('/:id/eliminar', isSuperAdmin, usuariosController.eliminar);
router.post('/:id/toggle-activo', isSuperAdmin, usuariosController.toggleActivo);

export default router;
