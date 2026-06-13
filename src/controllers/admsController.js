
import config from '../config/env.js';
import { logAdms } from '../middleware/admsAuth.js';
import { horaLocalDevice } from '../utils/tiempo.js';
import {
  procesarAttlog,
  obtenerComandosPendientes,
  confirmarComando
} from '../services/admsService.js';

function bodyTexto(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return '';
}

/**
 * GET/POST /iclock/ping?SN=<sn> -> heartbeat del device.
 * admsAuth ya actualizó Ultima_Conexion/IP. Sólo se responde OK.
 */
export async function ping(req, res) {
  const inicio = Date.now();
  res.type('text/plain').send('OK');
  logAdms({ sn: req._admsSN, endpoint: 'ping', responseCode: 200, processingMs: Date.now() - inicio });
}

/**
 * GET /iclock/cdata?SN=<sn>&options=all  -> handshake (config del device)
 * POST /iclock/cdata?SN=<sn>&table=ATTLOG -> subida de checadas
 * POST /iclock/cdata?SN=<sn>&table=OPERLOG -> operaciones internas (se ack-ean)
 */
export async function cdata(req, res) {
  const inicio = Date.now();
  const sn = req._admsSN;

  // GET = handshake
  if (req.method === 'GET') {
    const cuerpo = construirHandshake(sn);
    res.type('text/plain').send(cuerpo);
    logAdms({ sn, endpoint: 'cdata:handshake', responseCode: 200, processingMs: Date.now() - inicio });
    return;
  }

  // POST = subida de datos
  const tabla = String(req.query.table || req.query.Table || '').toUpperCase();
  const body = bodyTexto(req);

  // SN no aprobado / desconocido / inactivo -> ack sin procesar
  if (!req.checador) {
    res.type('text/plain').send('OK');
    logAdms({ sn, endpoint: `cdata:${tabla || 'POST'}`, bodySize: body.length, responseCode: 200, processingMs: Date.now() - inicio, error: 'SN no procesable (pendiente/desconocido/inactivo)' });
    return;
  }

  try {
    if (tabla === 'ATTLOG') {
      const resumen = await procesarAttlog(req.checador, body);
      res.type('text/plain').send('OK');
      logAdms({
        sn, endpoint: 'cdata:ATTLOG', bodySize: body.length, responseCode: 200,
        processingMs: Date.now() - inicio,
        error: resumen.errores.length ? JSON.stringify(resumen).slice(0, 1500) : null
      });
      return;
    }

    // OPERLOG u otras tablas: aceptar sin procesar (auditoría futura)
    res.type('text/plain').send('OK');
    logAdms({ sn, endpoint: `cdata:${tabla || 'POST'}`, bodySize: body.length, responseCode: 200, processingMs: Date.now() - inicio });
  } catch (err) {
    // Aún ante error interno, ack al device (reintentaría y duplicaría; la idempotencia protege).
    res.type('text/plain').send('OK');
    logAdms({ sn, endpoint: `cdata:${tabla || 'POST'}`, bodySize: body.length, responseCode: 200, processingMs: Date.now() - inicio, error: err.message });
  }
}

/**
 * GET /iclock/getrequest?SN=<sn> -> el device pide comandos pendientes.
 * Responder lista de comandos o "OK" si no hay.
 */
export async function getrequest(req, res) {
  const inicio = Date.now();
  const sn = req._admsSN;

  if (!req.checador) {
    res.type('text/plain').send('OK');
    logAdms({ sn, endpoint: 'getrequest', responseCode: 200, processingMs: Date.now() - inicio });
    return;
  }

  try {
    const comandos = await obtenerComandosPendientes(req.checador, 20);
    res.type('text/plain').send(comandos || 'OK');
    logAdms({ sn, endpoint: 'getrequest', responseCode: 200, processingMs: Date.now() - inicio });
  } catch (err) {
    res.type('text/plain').send('OK');
    logAdms({ sn, endpoint: 'getrequest', responseCode: 200, processingMs: Date.now() - inicio, error: err.message });
  }
}

/**
 * POST /iclock/devicecmd?SN=<sn> -> el device confirma ejecución de un comando.
 */
export async function devicecmd(req, res) {
  const inicio = Date.now();
  const sn = req._admsSN;
  const body = bodyTexto(req);

  try {
    if (req.checador) await confirmarComando(body);
    res.type('text/plain').send('OK');
    logAdms({ sn, endpoint: 'devicecmd', bodySize: body.length, responseCode: 200, processingMs: Date.now() - inicio, error: body ? body.slice(0, 500) : null });
  } catch (err) {
    res.type('text/plain').send('OK');
    logAdms({ sn, endpoint: 'devicecmd', bodySize: body.length, responseCode: 200, processingMs: Date.now() - inicio, error: err.message });
  }
}

/**
 * Template del handshake ZK.
 * ⚠️ VERIFICAR contra device real. TimeZone configurable vía ADMS_TIMEZONE.
 * TransFlag indica qué tablas sube el device; Realtime=1 => push inmediato.
 */
/**
 * GET|POST /iclock/rtdata?SN=<sn>&type=time
 * El device solicita la hora actual del servidor para sincronizar su reloj.
 * Respuesta ZK: "TIME HH:MM:SS\nDATE YYYY-MM-DD\n"
 */
export async function rtdata(req, res) {
  const inicio = Date.now();
  const sn = req._admsSN;
  const type = req.query.type || '';

  const { fecha, hora } = horaLocalDevice();
  const cuerpo = `TIME ${hora}\nDATE ${fecha}\n`;
  res.type('text/plain').send(cuerpo);
  logAdms({ sn, endpoint: `rtdata:${type}`, responseCode: 200, processingMs: Date.now() - inicio });
}

function construirHandshake(sn) {
  return [
    `GET OPTION FROM: ${sn}`,
    'Stamp=9999',
    'OpStamp=0',
    'ErrorDelay=30',
    'Delay=10',
    'TransTimes=00:00;14:05',
    'TransInterval=1',
    'TransFlag=TransData AttLog OpLog',
    `TimeZone=${config.adms.timezone}`,
    'Realtime=1',
    'Encrypt=None'
  ].join('\n');
}

export default { ping, cdata, getrequest, devicecmd, rtdata };
