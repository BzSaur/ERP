/**
 * Rutas de Nómina
 */

import { Router } from 'express';
import * as nominaController from '../controllers/nominaController.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = Router();

// Aplicar middleware de autenticación
router.use(isAuthenticated);

// Dashboard de nómina
router.get('/', nominaController.dashboard);

// ============================================================
// PERIODOS
// ============================================================

// Listar periodos
router.get('/periodos', nominaController.periodos);

// Formulario crear periodo
router.get('/periodos/crear', nominaController.crearPeriodo);

// Guardar nuevo periodo
router.post('/periodos', nominaController.storePeriodo);

// Ver detalle de periodo
router.get('/periodos/:id', nominaController.verPeriodo);

// Calcular nómina del periodo
router.post('/periodos/:id/calcular', nominaController.calcularNomina);

// Cerrar periodo
router.post('/periodos/:id/cerrar', nominaController.cerrarPeriodo);

// Ver nómina de un empleado específico
router.get('/periodos/:periodoId/empleado/:empleadoId', nominaController.verNominaEmpleado);

export default router;
