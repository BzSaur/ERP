import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import {
  loginLimiter,
  generateCsrfToken,
  csrfProtection
} from '../config/security.js';

const router = Router();

// ============================================================
// RUTAS DE AUTENTICACIÓN
// ============================================================

// GET /auth/login - Mostrar formulario de login
router.get('/login', generateCsrfToken, authController.showLogin);

// POST /auth/login - Procesar login
router.post(
  '/login',
  loginLimiter,
  csrfProtection,
  authController.processLogin
);

// GET /auth/logout - Cerrar sesión
router.get('/logout', authController.logout);


// Solo lectura — cualquier rol autenticado
export const isConsulta = (req, res, next) => {
  return hasRole(
    'SUPER_ADMIN', 'ADMIN', 'RH', 'RECURSOS_HUMANOS', 'CONSULTA'
  )(req, res, next);
};

export default router;
