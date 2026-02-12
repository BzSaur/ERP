/**
 * Configuración de Winston Logger
 * ERP - Recursos Humanos
 * 
 * Logs SOLO en consola/terminal
 */

import winston from 'winston';

// Formato para consola con colores
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let log = `${timestamp} ${level}: ${message}`;
    
    // Agregar metadata si existe (sin hacer el log muy largo)
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

// Logger de base de datos - SOLO CONSOLA (pero no se usa para evitar ruido)
export const dbLogger = winston.createLogger({
  level: 'info',
  format: consoleFormat,
  transports: [
    new winston.transports.Console()
  ],
  exitOnError: false
});

// Funciones de utilidad para logging en consola
export const logAccess = {
  login: (userId, email, ip, success = true) => {
    if (success) {
      accessLogger.info(`LOGIN: ${email} desde ${ip}`);
    } else {
      accessLogger.warn(`LOGIN FALLIDO: ${email} desde ${ip}`);
    }
  },
  
  logout: (userId, email) => {
    accessLogger.info(`LOGOUT: ${email}`);
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
  query: (operation, model, duration) => {
    // No loggear queries para evitar ruido
  },
  
  error: (operation, model, error) => {
    // No loggear errores de DB para evitar ruido
  }
};

export default logger;
