/**
 * Rutas de Importación de Checadores - RAM
 */

import express from 'express';
import * as checadorController from '../controllers/checadorController.js';
import { isAuthenticated, isRH } from '../middleware/auth.js';

const router = express.Router();

// Todos los roles RH y superiores pueden usar el checador
router.use(isAuthenticated);
router.use(isRH);

router.get('/', checadorController.index);

router.post('/procesar',
  checadorController.upload.fields([
    { name: 'ram1', maxCount: 1 },
    { name: 'ram2', maxCount: 1 }
  ]),
  checadorController.procesarArchivos
);

router.post('/guardar', checadorController.guardarResultados);
router.get('/empleado/:idChecador', checadorController.detalleEmpleado);

export default router;