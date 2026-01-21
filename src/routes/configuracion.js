/**
 * Rutas de Configuración (SuperAdmin)
 */

import { Router } from 'express';
import * as configuracionController from '../controllers/configuracionController.js';
import { isAuthenticated, isSuperAdmin } from '../middleware/auth.js';

const router = Router();

// Aplicar middleware de autenticación y verificar SuperAdmin
router.use(isAuthenticated);
router.use(isSuperAdmin);

// Panel principal
router.get('/', configuracionController.index);

// Roles
router.get('/roles', configuracionController.roles);
router.post('/roles', configuracionController.crearRol);
router.put('/roles/:id', configuracionController.actualizarRol);

// Estatus
router.get('/estatus', configuracionController.estatus);
router.post('/estatus', configuracionController.crearEstatus);
router.put('/estatus/:id', configuracionController.actualizarEstatus);

export default router;
