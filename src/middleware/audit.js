/**
 * Middleware de Auditoría - RAM ERP
 * Registra todos los cambios realizados por ADMIN y RH para que SUPER_ADMIN los vea
 */

import prisma from '../config/database.js';
import logger from '../config/logger.js';

/**
 * Registra un cambio en la bitácora
 * @param {Object} params - Parámetros del cambio
 * @param {Object} params.usuario - Usuario que realiza el cambio (req.user)
 * @param {string} params.accion - Tipo de acción: 'CREATE', 'UPDATE', 'DELETE'
 * @param {string} params.tabla - Nombre de la tabla afectada
 * @param {string} params.idRegistro - ID del registro afectado
 * @param {string} params.descripcion - Descripción legible del cambio
 * @param {Object} params.datosPrevios - Datos antes del cambio (para UPDATE/DELETE)
 * @param {Object} params.datosNuevos - Datos después del cambio (para CREATE/UPDATE)
 * @param {string} params.ip - Dirección IP del usuario
 */
export async function registrarCambio({
  usuario,
  accion,
  tabla,
  idRegistro,
  descripcion,
  datosPrevios = null,
  datosNuevos = null,
  ip = null
}) {
  try {
    // Solo registrar si el usuario es ADMIN o RH (no SUPER_ADMIN ni CONSULTA)
    if (!usuario || !usuario.rol) return;
    
    const rolNormalizado = String(usuario.rol.Nombre_Rol).toUpperCase().replace(/\s+/g, '_');
    const esAdminORH = ['ADMIN', 'ADMINISTRADOR', 'RH', 'RECURSOS_HUMANOS'].includes(rolNormalizado);
    
    if (!esAdminORH) return; // Solo auditar cambios de ADMIN y RH

    // Limpiar datos sensibles antes de guardar
    const datosPreviosLimpios = limpiarDatosSensibles(datosPrevios);
    const datosNuevosLimpios = limpiarDatosSensibles(datosNuevos);

    await prisma.bitacora_Cambios.create({
      data: {
        ID_Usuario: usuario.ID_Usuario,
        Email_Usuario: usuario.Email_Office365,
        Rol_Usuario: usuario.rol.Nombre_Rol,
        Accion: accion.toUpperCase(),
        Tabla: tabla,
        ID_Registro: String(idRegistro),
        Descripcion: descripcion,
        Datos_Previos: datosPreviosLimpios,
        Datos_Nuevos: datosNuevosLimpios,
        IP_Usuario: ip
      }
    });

    logger.info(`[AUDIT] ${accion} en ${tabla} #${idRegistro} por ${usuario.Email_Office365}`);
  } catch (error) {
    // No fallar la operación principal si el registro de auditoría falla
    logger.error(`Error registrando cambio en auditoría: ${error.message}`);
  }
}

/**
 * Elimina campos sensibles de los datos antes de guardarlos en la bitácora
 */
function limpiarDatosSensibles(datos) {
  if (!datos || typeof datos !== 'object') return datos;

  const datosLimpios = { ...datos };
  const camposSensibles = ['Password', 'password', 'pwd', 'token', 'secret'];

  camposSensibles.forEach(campo => {
    if (datosLimpios[campo]) {
      datosLimpios[campo] = '***OCULTO***';
    }
  });

  return datosLimpios;
}

/**
 * Helper para obtener IP del request
 */
export function obtenerIP(req) {
  return req.ip || 
         req.headers['x-forwarded-for']?.split(',')[0] || 
         req.connection?.remoteAddress || 
         'Unknown';
}

/**
 * Middleware express que agrega función de auditoría al request
 * Uso: router.use(auditMiddleware);
 */
export function auditMiddleware(req, res, next) {
  // Agregar helper de auditoría al request
  req.audit = async (params) => {
    await registrarCambio({
      usuario: req.user,
      ip: obtenerIP(req),
      ...params
    });
  };
  
  next();
}

export default {
  registrarCambio,
  obtenerIP,
  auditMiddleware
};
