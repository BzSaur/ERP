/**
 * Configuración de Winston Logger
 * ERP - Recursos Humanos
 *
 * Logs en consola + Bitácora de Accesos en DB
 */

import winston from 'winston';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Formato para consola con colores
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let log = `${timestamp} ${level}: ${message}`;

    if (Object.keys(metadata).length > 0) {
      const meta = JSON.stringify(metadata, null, 0);
      if (meta.length < 200) {
        log += ` ${meta}`;
      }
    }

    return log;
  })
);

// Logger principal - SOLO CONSOLA
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: consoleFormat,
  transports: [
    new winston.transports.Console()
  ],
  exitOnError: false
});

// Logger de acceso - SOLO CONSOLA
export const accessLogger = winston.createLogger({
  level: 'info',
  format: consoleFormat,
  transports: [
    new winston.transports.Console()
  ],
  exitOnError: false
});

// Logger de base de datos - SOLO CONSOLA
export const dbLogger = winston.createLogger({
  level: 'info',
  format: consoleFormat,
  transports: [
    new winston.transports.Console()
  ],
  exitOnError: false
});

/**
 * Escribe un registro en Bitacora_Accesos.
 * Nunca lanza error (envuelto en try/catch) para no bloquear el flujo de auth.
 */
async function registrarAccesoDB({ userId, email, accion, ip, userAgent, exitoso, motivoError }) {
  try {
    // Para logins fallidos sin usuario conocido, intentar buscar por email
    let idUsuario = userId;
    if (!idUsuario && email) {
      const usuario = await prisma.app_Usuarios.findFirst({
        where: { Email_Office365: email },
        select: { ID_Usuario: true }
      });
      idUsuario = usuario?.ID_Usuario;
    }

    // Si no tenemos ID_Usuario, no podemos insertar (FK requerida)
    if (!idUsuario) return;

    await prisma.bitacora_Accesos.create({
      data: {
        ID_Usuario: idUsuario,
        Email_Usuario: email || '',
        Accion: accion,
        IP_Usuario: ip || null,
        User_Agent: userAgent || null,
        Exitoso: exitoso,
        Motivo_Error: motivoError || null
      }
    });
  } catch (err) {
    // Solo consola, nunca bloquear login/logout
    console.error('Error al registrar en Bitacora_Accesos:', err.message);
  }
}

// Funciones de utilidad para logging
export const logAccess = {
  login: (userId, email, ip, success = true, { userAgent, motivoError } = {}) => {
    if (success) {
      accessLogger.info(`LOGIN: ${email} desde ${ip}`);
    } else {
      accessLogger.warn(`LOGIN FALLIDO: ${email} desde ${ip}`);
    }

    registrarAccesoDB({
      userId,
      email,
      accion: success ? 'Login' : 'Login Fallido',
      ip,
      userAgent,
      exitoso: success,
      motivoError: success ? null : (motivoError || 'Credenciales inválidas')
    });
  },

  logout: (userId, email, { ip, userAgent } = {}) => {
    accessLogger.info(`LOGOUT: ${email}`);

    registrarAccesoDB({
      userId,
      email,
      accion: 'Logout',
      ip,
      userAgent,
      exitoso: true
    });
  },

  action: (userId, action, resource, details = {}) => {
    const detailsStr = details.nombre ? ` - ${details.nombre}` : '';
    accessLogger.info(`${action}: ${resource}${detailsStr}`);
  },

  unauthorized: (ip, path, reason) => {
    accessLogger.warn(`ACCESO DENEGADO: ${path} desde ${ip} - ${reason}`);
  }
};

export const logDb = {
  query: (operation, model, duration) => {},
  error: (operation, model, error) => {}
};

export default logger;
