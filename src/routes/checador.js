/**
 * Rutas de Importación de Checadores - RAM
 */

import express from 'express';
import * as checadorController from '../controllers/checadorController.js';
import { isAuthenticated, hasRole } from '../middleware/auth.js';

const router = express.Router();

// Formulario de importación
router.get('/',
  isAuthenticated,
  hasRole('Recursos Humanos', 'Administrador', 'SuperAdministrador'),
  checadorController.index
);

// Procesar archivos subidos
router.post('/procesar',
  isAuthenticated,
  hasRole('Recursos Humanos', 'Administrador', 'SuperAdministrador'),
  checadorController.upload.fields([
    { name: 'ram1', maxCount: 1 },
    { name: 'ram2', maxCount: 1 }
  ]),
  checadorController.procesarArchivos
);

// Detalle de empleado
router.get('/empleado/:idChecador',
  isAuthenticated,
  hasRole('Recursos Humanos', 'Administrador', 'SuperAdministrador'),
  checadorController.detalleEmpleado
);

export default router;
