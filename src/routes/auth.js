import { Router } from 'express';
import * as authController from '../controllers/authController.js';

const router = Router();

// ============================================================
// RUTAS DE AUTENTICACIÓN
// ============================================================

// GET /auth/login - Mostrar formulario de login
router.get('/login', authController.showLogin);

// POST /auth/login - Procesar login
router.post('/login', authController.processLogin);

// GET /auth/logout - Cerrar sesión
router.get('/logout', authController.logout);

export default router;
