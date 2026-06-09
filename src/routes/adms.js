/**
 * Rutas ADMS — protocolo ZK PUSH para checadores CLK-980.
 *
 * Montadas en /iclock. NO usan auth de sesión (los devices no manejan cookies);
 * la autenticación es por Serial_Number vía middleware admsAuth.
 *
 * El montaje en app.js (rate-limit, body text/plain, bypass de headers) ocurre
 * ANTES de session/passport. Ver app.js.
 */

import express from 'express';
import { admsAuth } from '../middleware/admsAuth.js';
import * as adms from '../controllers/admsController.js';

const router = express.Router();

// Todas las rutas validan SN primero
router.use(admsAuth);

// Heartbeat del device (ping periódico). Sólo ack OK + telemetría de conexión.
router.get('/ping', adms.ping);
router.post('/ping', adms.ping);

// Handshake (GET) + subida de datos (POST)
router.get('/cdata', adms.cdata);
router.post('/cdata', adms.cdata);

// Cola de comandos (pull)
router.get('/getrequest', adms.getrequest);

// Confirmación de comandos
router.post('/devicecmd', adms.devicecmd);

export default router;
