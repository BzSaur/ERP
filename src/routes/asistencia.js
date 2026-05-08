/**
 * Rutas de Asistencia - RAM
 * Control de asistencia y API para sistema biométrico
 */

import express from 'express';
import * as asistenciaController from '../controllers/asistenciaController.js';
import { isAuthenticated, isAdmin, isRH } from '../middleware/auth.js';

const router = express.Router();

// ============================================================
// API PARA SISTEMA BIOMÉTRICO (Autenticación por API Key)
// ============================================================

const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const BIOMETRIC_API_KEY = process.env.BIOMETRIC_API_KEY;

  // Fallar fuerte si no está configurada — igual que SESSION_SECRET
  if (!BIOMETRIC_API_KEY) {
    console.error('[FATAL] BIOMETRIC_API_KEY no configurada en variables de entorno.');
    return res.status(500).json({ success: false, error: 'Configuración de servidor incompleta' });
  }

  if (!apiKey || apiKey !== BIOMETRIC_API_KEY) {
    return res.status(401).json({ success: false, error: 'API Key inválida o no proporcionada' });
  }

  next();
};

router.post('/api/checada', validateApiKey, asistenciaController.apiRegistrarChecada);
router.post('/api/sincronizar', validateApiKey, asistenciaController.apiSincronizar);

// ============================================================
// RUTAS AUTENTICADAS — Solo lectura (todos los roles)
// ============================================================
router.use(isAuthenticated);

router.get('/api/resumen-diario', asistenciaController.apiResumenDiario);
router.get('/api/empleado/:id', asistenciaController.apiAsistenciaEmpleado);
router.get('/api/bono-puntualidad/:id', asistenciaController.apiBonoPuntualidad);
router.get('/api/por-ubicacion', asistenciaController.apiReportePorUbicacion);

// ============================================================
// RUTAS DE VISTAS — RH y ADMIN
// ============================================================
router.use(isRH);

router.get('/', asistenciaController.index);
router.get('/empleado/:id', asistenciaController.reporteEmpleado);
router.get('/por-ubicacion', asistenciaController.reporteUbicacion);
router.post('/api/marcar-faltas', asistenciaController.apiMarcarFaltas);

// Solo ADMIN puede hacer checada manual
router.get('/checada-manual', isAdmin, asistenciaController.formChecadaManual);
router.post('/checada-manual', isAdmin, asistenciaController.registrarChecadaManual);

export default router;