/**
 * Rutas de Asistencia - RAM
 * Control de asistencia y API para sistema biométrico
 */

import express from 'express';
import * as asistenciaController from '../controllers/asistenciaController.js';
import { isAuthenticated, hasRole } from '../middleware/auth.js';

const router = express.Router();

// ============================================================
// RUTAS DE VISTAS (Requieren autenticación)
// ============================================================

// Dashboard de asistencia
router.get('/', 
  isAuthenticated, 
  asistenciaController.index
);

// Reporte de empleado específico
router.get('/empleado/:id', 
  isAuthenticated, 
  hasRole('Recursos Humanos', 'Administrador', 'Supervisor'),
  asistenciaController.reporteEmpleado
);

// Reporte por ubicación (RAM1/RAM2)
router.get('/por-ubicacion', 
  isAuthenticated, 
  hasRole('Recursos Humanos', 'Administrador', 'Supervisor'),
  asistenciaController.reporteUbicacion
);

// Formulario para checada manual
router.get('/checada-manual', 
  isAuthenticated, 
  hasRole('Recursos Humanos', 'Administrador'),
  asistenciaController.formChecadaManual
);

// Registrar checada manual (POST)
router.post('/checada-manual', 
  isAuthenticated, 
  hasRole('Recursos Humanos', 'Administrador'),
  asistenciaController.registrarChecadaManual
);

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
// API PARA USO INTERNO (Requieren autenticación)
// ============================================================

// Obtener resumen diario
router.get('/api/resumen-diario', 
  isAuthenticated,
  asistenciaController.apiResumenDiario
);

// Obtener asistencia de un empleado
router.get('/api/empleado/:id', 
  isAuthenticated,
  asistenciaController.apiAsistenciaEmpleado
);

// Verificar bono de puntualidad
router.get('/api/bono-puntualidad/:id', 
  isAuthenticated,
  asistenciaController.apiBonoPuntualidad
);

// Obtener reporte por ubicación
router.get('/api/por-ubicacion', 
  isAuthenticated,
  asistenciaController.apiReportePorUbicacion
);

// Marcar faltas (solo RH/Admin)
router.post('/api/marcar-faltas', 
  isAuthenticated,
  hasRole('Recursos Humanos', 'Administrador'),
  asistenciaController.apiMarcarFaltas
);

export default router;
