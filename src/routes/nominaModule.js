/**
 * Módulo de Nómina y Prestaciones
 * Agrupa: Nómina, Vacaciones, Aguinaldo, Finiquito, Horas Adicionales
 * 
 * RBAC según matriz:
 * SUPER_ADMIN / ADMIN → CRUD completo
 * RH                  → Ver + Aprobar
 * CONSULTA            → Sin acceso a nómina
 */

import { Router } from 'express';
import { isAuthenticated, isAdmin, isRH } from '../middleware/auth.js';

import * as nominaController from '../controllers/nominaController.js';
import * as vacacionesController from '../controllers/vacacionesController.js';
import * as aguinaldoController from '../controllers/aguinaldoController.js';
import * as finiquitoController from '../controllers/finiquitoController.js';
import * as horasAdicionalesController from '../controllers/horasAdicionalesController.js';

const router = Router();
router.use(isAuthenticated);
router.use(isRH); // mínimo RH para entrar — CONSULTA sin acceso

// ============================================================
// NÓMINA — RH ve, ADMIN opera
// ============================================================

router.get('/nomina', nominaController.dashboard);
router.get('/nomina/periodos', nominaController.periodos);
router.get('/nomina/periodos/:id', nominaController.verPeriodo);
router.get('/nomina/periodos/:periodoId/empleado/:empleadoId', nominaController.verNominaEmpleado);

// Solo ADMIN
router.get('/nomina/periodos/crear', isAdmin, nominaController.crearPeriodo);
router.post('/nomina/periodos', isAdmin, nominaController.storePeriodo);
router.post('/nomina/periodos/:id/calcular', isAdmin, nominaController.calcularNomina);
router.post('/nomina/periodos/:id/cerrar', isAdmin, nominaController.cerrarPeriodo);

// ============================================================
// VACACIONES — RH ve y aprueba, ADMIN opera
// ============================================================

router.get('/vacaciones', vacacionesController.index);
router.get('/vacaciones/elegibilidad', vacacionesController.elegibilidad);
router.post('/vacaciones/:id/aprobar', vacacionesController.aprobar);

// Solo ADMIN
router.get('/vacaciones/crear', isAdmin, vacacionesController.crear);
router.post('/vacaciones', isAdmin, vacacionesController.store);
router.post('/vacaciones/generar', isAdmin, vacacionesController.generarVacaciones);

// ============================================================
// AGUINALDO — RH ve, ADMIN opera
// ============================================================

router.get('/aguinaldo', aguinaldoController.index);
router.get('/aguinaldo/:id', aguinaldoController.ver);

// Solo ADMIN
router.post('/aguinaldo/calcular', isAdmin, aguinaldoController.calcular);
router.post('/aguinaldo/pagar-todos', isAdmin, aguinaldoController.pagarTodos);
router.post('/aguinaldo/:id/editar-faltas', isAdmin, aguinaldoController.editarFaltas);
router.post('/aguinaldo/:id/pagar', isAdmin, aguinaldoController.pagar);
router.delete('/aguinaldo/:id', isAdmin, aguinaldoController.eliminar);
router.delete('/aguinaldo', isAdmin, aguinaldoController.eliminarTodos);

// ============================================================
// FINIQUITO — RH ve y aprueba, ADMIN opera
// ============================================================

router.get('/finiquito', finiquitoController.index);
router.get('/finiquito/:id', finiquitoController.ver);
router.post('/finiquito/:id/aprobar', finiquitoController.aprobar);

// Solo ADMIN
router.get('/finiquito/crear', isAdmin, finiquitoController.crear);
router.post('/finiquito', isAdmin, finiquitoController.calcular);
router.post('/finiquito/:id/pagar', isAdmin, finiquitoController.pagar);
router.delete('/finiquito/:id', isAdmin, finiquitoController.eliminar);

// ============================================================
// HORAS ADICIONALES — RH ve y aprueba, ADMIN opera
// ============================================================

router.get('/horas-adicionales', horasAdicionalesController.index);
router.post('/horas-adicionales/:id/aprobar', horasAdicionalesController.aprobar);

// Solo ADMIN
router.get('/horas-adicionales/crear', isAdmin, horasAdicionalesController.crear);
router.post('/horas-adicionales', isAdmin, horasAdicionalesController.store);
router.get('/horas-adicionales/:id/editar', isAdmin, horasAdicionalesController.editar);
router.put('/horas-adicionales/:id', isAdmin, horasAdicionalesController.update);
router.delete('/horas-adicionales/:id', isAdmin, horasAdicionalesController.eliminar);

export default router;