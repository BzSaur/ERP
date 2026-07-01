/**
 * Rutas de Asistencia - RAM
 * Control de asistencia y API para sistema biométrico
 */

import express from 'express';
import * as asistenciaController from '../controllers/asistenciaController.js';
import { isAuthenticated, isAdminOrRH, canView } from '../middleware/auth.js';

const router = express.Router();

// ============================================================
// API PARA SISTEMA BIOMÉTRICO (Autenticación por API Key)
// ============================================================

// Middleware para validar API Key del dispositivo biométrico
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  // En producción, esto debería verificarse contra la BD
  const BIOMETRIC_API_KEY = process.env.BIOMETRIC_API_KEY || 'ram-biometric-key-2024';
  
  if (!apiKey || apiKey !== BIOMETRIC_API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'API Key inválida o no proporcionada'
    });
  }
  
  next();
};

// Registrar checada (desde dispositivo biométrico)
router.post('/api/checada', 
  validateApiKey,
  asistenciaController.apiRegistrarChecada
);

// Sincronizar lote de checadas
router.post('/api/sincronizar', 
  validateApiKey,
  asistenciaController.apiSincronizar
);

// ============================================================
// Aplicar autenticación a todas las rutas siguientes
// ============================================================
router.use(isAuthenticated);

// ============================================================
// API PARA USO INTERNO (Solo lectura - requiere autenticación)
// ============================================================

// Obtener resumen diario
router.get('/api/resumen-diario', asistenciaController.apiResumenDiario);

// Obtener asistencia de un empleado
router.get('/api/empleado/:id', asistenciaController.apiAsistenciaEmpleado);

// Verificar bono de puntualidad
router.get('/api/bono-puntualidad/:id', asistenciaController.apiBonoPuntualidad);

// Obtener reporte por ubicación
router.get('/api/por-ubicacion', asistenciaController.apiReportePorUbicacion);

// ============================================================
// RUTAS DE VISTAS DE SOLO LECTURA (ADMIN/RH/CONSULTA)
// ============================================================

// Dashboard de asistencia
router.get('/', canView, asistenciaController.index);

// Reporte/desglose de empleado específico (CONSULTA no accede al detalle individual)
router.get('/empleado/:id', isAdminOrRH, asistenciaController.reporteEmpleado);

// Consultar horas: tabla global (todos) + descarga Excel (CONSULTA sí); desglose individual (solo ADMIN/RH)
router.get('/horas', canView, asistenciaController.horasTodos);
router.get('/horas/excel', canView, asistenciaController.descargarHorasExcel);
router.get('/horas/:id', isAdminOrRH, asistenciaController.desgloseHoras);

// Reporte por ubicación (dinámico por planta)
router.get('/por-ubicacion', canView, asistenciaController.reporteUbicacion);

// Desglose completo del día (presencia en vivo + tabla cronológica)
router.get('/dia', canView, asistenciaController.desgloseDia);

// ============================================================
// RUTAS DE ESCRITURA (Requieren ADMIN/RH — CONSULTA excluido)
// ============================================================

// Formulario para checada manual
router.get('/checada-manual', isAdminOrRH, asistenciaController.formChecadaManual);

// Registrar checada manual (POST)
router.post('/checada-manual', isAdminOrRH, asistenciaController.registrarChecadaManual);

// Marcar faltas (solo RH/Admin)
router.post('/api/marcar-faltas', isAdminOrRH, asistenciaController.apiMarcarFaltas);

export default router;
