/**
 * Middleware de autenticación ADMS — valida el Serial_Number del device.
 *
 * Los endpoints /iclock/* NO usan sesión/passport (los devices no manejan cookies).
 * La "autenticación" es por SN registrado en la tabla Checadores.
 *
 * - SN conocido y aprobado -> req.checador, actualiza Ultima_Conexion/Ultima_IP_Origen.
 * - SN desconocido -> auto-discovery: crea registro 'pendiente_aprobacion' (con cap
 *   ADMS_PENDIENTES_MAX para evitar flood), responde OK al device igual, y deja
 *   req.checador = null (el controller responde OK pero no procesa checadas).
 * - SN conocido pero pendiente/inactivo -> responde OK, no procesa.
 */

import prisma from '../config/database.js';
import config from '../config/env.js';

/** IP de origen real (considera el reverse proxy DSM). */
function ipOrigen(req) {
  return (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) || req.ip || req.socket?.remoteAddress || null;
}

export async function admsAuth(req, res, next) {
  // Feature flag: ADMS apagado -> 404 (como si las rutas no existieran)
  if (!config.adms.enabled) {
    return res.status(404).type('text/plain').send('');
  }

  const sn = String(req.query.SN || req.query.sn || '').trim();
  req._admsSN = sn;
  req._admsIp = ipOrigen(req);

  if (!sn) {
    // Sin SN no hay forma de identificar el device. Responder OK para no romper el loop.
    req.checador = null;
    return next();
  }

  try {
    let checador = await prisma.checadores.findUnique({
      where: { Serial_Number: sn },
      include: { planta: { select: { ID_Planta: true, Nombre: true } } }
    });

    // Auto-discovery: SN nuevo
    if (!checador) {
      const pendientes = await prisma.checadores.count({
        where: { Estado_Registro: 'pendiente_aprobacion' }
      });

      if (pendientes < config.adms.pendientesMax) {
        // Necesita una planta para la FK. Usar/crear una planta "Sin Asignar".
        const plantaDefault = await obtenerPlantaSinAsignar();
        checador = await prisma.checadores.create({
          data: {
            Serial_Number: sn,
            Nombre: `Auto-descubierto ${sn}`,
            ID_Planta: plantaDefault.ID_Planta,
            Estado_Registro: 'pendiente_aprobacion',
            Activo: false,
            Ultima_Conexion: new Date(),
            Ultima_IP_Origen: req._admsIp
          },
          include: { planta: { select: { ID_Planta: true, Nombre: true } } }
        }).catch(async (e) => {
          // Carrera: otro request lo creó primero
          if (e.code === 'P2002') {
            return prisma.checadores.findUnique({
              where: { Serial_Number: sn },
              include: { planta: { select: { ID_Planta: true, Nombre: true } } }
            });
          }
          throw e;
        });
      }
      // Pendiente o sobre el cap: no procesar checadas, pero responder OK
      req.checador = null;
      return next();
    }

    // Actualizar telemetría de conexión (no bloquea el flujo si falla)
    prisma.checadores.update({
      where: { ID_Checador: checador.ID_Checador },
      data: { Ultima_Conexion: new Date(), Ultima_IP_Origen: req._admsIp }
    }).catch(() => {});
    checador.Ultima_IP_Origen = req._admsIp;

    // Sólo procesar si está aprobado y activo
    if (checador.Estado_Registro !== 'aprobado' || !checador.Activo) {
      req.checador = null;
      return next();
    }

    req.checador = checador;
    return next();
  } catch (err) {
    // Ante cualquier fallo, responder OK al device para no romper el loop ADMS.
    console.error('admsAuth error:', err.message);
    req.checador = null;
    return next();
  }
}

/** Planta de respaldo para devices auto-descubiertos sin asignar. */
async function obtenerPlantaSinAsignar() {
  const existente = await prisma.cat_Plantas.findUnique({ where: { Nombre: 'Sin Asignar' } });
  if (existente) return existente;
  return prisma.cat_Plantas.create({
    data: { Nombre: 'Sin Asignar', Activo: false }
  }).catch(async (e) => {
    if (e.code === 'P2002') return prisma.cat_Plantas.findUnique({ where: { Nombre: 'Sin Asignar' } });
    throw e;
  });
}

/** Registra una entrada en ADMS_Logs (best-effort, no bloquea). */
export function logAdms({ sn, endpoint, bodySize, responseCode, processingMs, error }) {
  prisma.aDMS_Logs.create({
    data: {
      SN: sn || null,
      Endpoint: endpoint,
      Body_Size: bodySize ?? null,
      Response_Code: responseCode,
      Processing_Ms: processingMs ?? null,
      Error: error ? String(error).slice(0, 2000) : null
    }
  }).catch(() => {});
}

export default { admsAuth, logAdms };
