/**
 * Rutas de Asistencia - RAM
 * Control de asistencia y API para sistema biométrico
 */

import express from 'express';
import * as asistenciaController from '../controllers/asistenciaController.js';
import { isAuthenticated, isAdminOrRH } from '../middleware/auth.js';

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
// Aplicar rol ADMIN/RH a todas las rutas siguientes
// ============================================================
router.use(isAdminOrRH);

// ============================================================
// RUTAS DE VISTAS (Requieren autenticación + ADMIN/RH)
// ============================================================

// Dashboard de asistencia
router.get('/', asistenciaController.index);

// Reporte de empleado específico
router.get('/empleado/:id', asistenciaController.reporteEmpleado);

// Reporte por ubicación (RAM1/RAM2)
router.get('/por-ubicacion', asistenciaController.reporteUbicacion);

// Formulario para checada manual
router.get('/checada-manual', asistenciaController.formChecadaManual);

// Registrar checada manual (POST)
router.post('/checada-manual', asistenciaController.registrarChecadaManual);

// ============================================================
// API PARA USO INTERNO (Modificación - requiere ADMIN/RH)
// ============================================================

// Marcar faltas (solo RH/Admin)
router.post('/api/marcar-faltas', asistenciaController.apiMarcarFaltas);

export default router;
