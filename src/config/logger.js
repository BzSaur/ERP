/**
 * Configuración de Winston Logger
 * ERP - Recursos Humanos
 * 
 * Logs en archivo con rotación diaria
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio de logs
const logsDir = path.join(__dirname, '../../logs');

// Formato personalizado para logs
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack, ...metadata }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(metadata).length > 0) {
      log += ` ${JSON.stringify(metadata)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Transporte para logs de aplicación
const applicationTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'application-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  level: 'info'
});

// Transporte para logs de errores
const errorTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error'
});

// Transporte para logs de acceso/seguridad
const accessTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'access-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '90d', // Retener 90 días para auditoría
  level: 'info'
});

// Transporte para logs de base de datos
const databaseTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'database-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  level: 'info'
});

// Logger principal de la aplicación
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  transports: [
    applicationTransport,
    errorTransport
  ],
  exitOnError: false
});

// Logger de acceso/seguridad (logins, acciones de usuario)
export const accessLogger = winston.createLogger({
  level: 'info',
  format: customFormat,
  transports: [accessTransport],
  exitOnError: false
});

// Logger de base de datos
export const dbLogger = winston.createLogger({
  level: 'info',
  format: customFormat,
  transports: [databaseTransport],
  exitOnError: false
});

// Agregar transporte de consola en desarrollo
if (process.env.NODE_ENV !== 'production') {
  const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
      format: 'HH:mm:ss'
    }),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  );

  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Funciones de utilidad para logging estructurado
export const logAccess = {
  login: (userId, email, ip, success = true) => {
    accessLogger.info(`LOGIN ${success ? 'SUCCESS' : 'FAILED'}`, {
      userId,
      email,
      ip,
      action: 'LOGIN',
      success
    });
  },
  
  logout: (userId, email) => {
    accessLogger.info(`LOGOUT`, {
      userId,
      email,
      action: 'LOGOUT'
    });
  },
  
  action: (userId, action, resource, details = {}) => {
    accessLogger.info(`USER ACTION: ${action}`, {
      userId,
      action,
      resource,
      ...details
    });
  },
  
  unauthorized: (ip, path, reason) => {
    accessLogger.warn(`UNAUTHORIZED ACCESS ATTEMPT`, {
      ip,
      path,
      reason,
      action: 'UNAUTHORIZED'
    });
  }
};

export const logDb = {
  query: (operation, model, duration) => {
    dbLogger.info(`DB ${operation}`, {
      model,
      duration: `${duration}ms`,
      operation
    });
  },
  
  error: (operation, model, error) => {
    dbLogger.error(`DB ERROR: ${operation}`, {
      model,
      error: error.message,
      operation
    });
  }
};

export default logger;
