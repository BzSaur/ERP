/**
 * Módulo de Nómina y Prestaciones
 * Agrupa: Nómina, Vacaciones, Aguinaldo, Finiquito, Horas Adicionales
 */

import { Router } from 'express';
import { isAuthenticated, isAdminOrRH } from '../middleware/auth.js';

// Importar controllers
import * as nominaController from '../controllers/nominaController.js';
import * as vacacionesController from '../controllers/vacacionesController.js';
import * as aguinaldoController from '../controllers/aguinaldoController.js';
import * as finiquitoController from '../controllers/finiquitoController.js';
import * as horasAdicionalesController from '../controllers/horasAdicionalesController.js';

const router = Router();

// Aplicar middleware a todas las rutas: ADMIN/RH únicamente
router.use(isAuthenticated);
router.use(isAdminOrRH);

// ============================================================
// PERÍODOS Y NÓMINA
// ============================================================

// Dashboard de nómina
router.get('/nomina', nominaController.dashboard);

// Listar periodos
router.get('/nomina/periodos', nominaController.periodos);

// Formulario crear periodo
router.get('/nomina/periodos/crear', nominaController.crearPeriodo);

// Guardar nuevo periodo
router.post('/nomina/periodos', nominaController.storePeriodo);

// Ver detalle de periodo
router.get('/nomina/periodos/:id', nominaController.verPeriodo);

// Calcular nómina del periodo
router.post('/nomina/periodos/:id/calcular', nominaController.calcularNomina);

// Cerrar periodo
router.post('/nomina/periodos/:id/cerrar', nominaController.cerrarPeriodo);

// Ver nómina de un empleado específico
router.get('/nomina/periodos/:periodoId/empleado/:empleadoId', nominaController.verNominaEmpleado);

// ============================================================
// VACACIONES
// ============================================================

// Listar vacaciones
router.get('/vacaciones', vacacionesController.index);

// Elegibilidad de empleados
router.get('/vacaciones/elegibilidad', vacacionesController.elegibilidad);

// Generar vacaciones automáticas
router.post('/vacaciones/generar', vacacionesController.generarVacaciones);

// Formulario registrar vacaciones
router.get('/vacaciones/crear', vacacionesController.crear);

// Guardar vacaciones
router.post('/vacaciones', vacacionesController.store);

// Aprobar vacaciones
router.post('/vacaciones/:id/aprobar', vacacionesController.aprobar);

// ============================================================
// AGUINALDO
// ============================================================

// Listar aguinaldos
router.get('/aguinaldo', aguinaldoController.index);

// Calcular aguinaldo para todos
router.post('/aguinaldo/calcular', aguinaldoController.calcular);

// Pagar todos los pendientes
router.post('/aguinaldo/pagar-todos', aguinaldoController.pagarTodos);

// Ver detalle
router.get('/aguinaldo/:id', aguinaldoController.ver);

// Editar faltas y recalcular
router.post('/aguinaldo/:id/editar-faltas', aguinaldoController.editarFaltas);

// Marcar como pagado
router.post('/aguinaldo/:id/pagar', aguinaldoController.pagar);

// Eliminar aguinaldo individual
router.delete('/aguinaldo/:id', aguinaldoController.eliminar);

// Eliminar todos los pendientes
router.delete('/aguinaldo', aguinaldoController.eliminarTodos);

// ============================================================
// FINIQUITO / LIQUIDACIÓN
// ============================================================

// Listar finiquitos
router.get('/finiquito', finiquitoController.index);

// Formulario crear
router.get('/finiquito/crear', finiquitoController.crear);

// Calcular y guardar
router.post('/finiquito', finiquitoController.calcular);

// Ver detalle
router.get('/finiquito/:id', finiquitoController.ver);

// Aprobar
router.post('/finiquito/:id/aprobar', finiquitoController.aprobar);

// Pagar
router.post('/finiquito/:id/pagar', finiquitoController.pagar);

// Eliminar
router.delete('/finiquito/:id', finiquitoController.eliminar);

// ============================================================
// HORAS ADICIONALES
// ============================================================

// Listar horas adicionales
router.get('/horas-adicionales', horasAdicionalesController.index);

// Formulario crear
router.get('/horas-adicionales/crear', horasAdicionalesController.crear);

// Guardar nuevas horas
router.post('/horas-adicionales', horasAdicionalesController.store);

// Formulario editar
router.get('/horas-adicionales/:id/editar', horasAdicionalesController.editar);

// Actualizar horas
router.put('/horas-adicionales/:id', horasAdicionalesController.update);

// Aprobar horas
router.post('/horas-adicionales/:id/aprobar', horasAdicionalesController.aprobar);

// Eliminar horas
router.delete('/horas-adicionales/:id', horasAdicionalesController.eliminar);

export default router;
