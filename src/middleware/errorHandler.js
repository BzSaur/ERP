// ============================================================
// MIDDLEWARE DE MANEJO DE ERRORES
// ============================================================

import logger from '../config/logger.js';

// Middleware para manejar errores 404
export const notFound = (req, res, next) => {
  res.status(404).render('errors/404', {
    title: 'Página no encontrada',
    message: `La página ${req.originalUrl} no existe`
  });
};

// Middleware para manejar errores generales
export const errorHandler = (err, req, res, next) => {
  // Loggear el error completo siempre
  logger.error(`Error en ${req.method} ${req.path}: ${err.message}`, {
    code: err.code,
    meta: err.meta,
    stack: err.stack
  });

  const fieldMap = {
    Documento_Identidad: 'Documento de identidad (CURP/pasaporte)',
    RFC: 'RFC',
    NSS: 'NSS',
    Email_Personal: 'Email personal',
    Email_Corporativo: 'Email corporativo',
    Nombre: 'Nombre',
    Apellido_Paterno: 'Apellido paterno',
    Apellido_Materno: 'Apellido materno',
    Telefono_Celular: 'Teléfono celular',
    Telefono_Emergencia: 'Teléfono de emergencia',
    Nombre_Emergencia: 'Nombre contacto emergencia',
    Calle: 'Calle',
    Colonia: 'Colonia',
    Ciudad: 'Ciudad',
    Entidad_Federativa: 'Estado',
    Codigo_Postal: 'Código postal'
  };

  // P2000 - valor demasiado largo para el campo
  if (err.code === 'P2000') {
    const field = err.meta?.column_name || err.meta?.field_name || '';
    const fieldLabel = fieldMap[field] || field || 'un campo';
    return res.status(400).render('errors/error', {
      title: 'Dato Demasiado Largo',
      message: `El valor ingresado en "${fieldLabel}" excede el límite de caracteres permitido. Por favor acórtalo.`,
      error: process.env.NODE_ENV === 'development' ? err : {}
    });
  }

  // P2002 - duplicado
  if (err.code === 'P2002') {
    const fields = err.meta?.target;
    let message = 'Ya existe un registro con esos datos';
    if (fields) {
      const fieldNames = Array.isArray(fields)
        ? fields.map(f => fieldMap[f] || f).join(', ')
        : (fieldMap[fields] || fields);
      message = `Ya existe un empleado con ese dato: ${fieldNames}`;
    }
    return res.status(400).render('errors/error', {
      title: 'Registro Duplicado',
      message,
      error: process.env.NODE_ENV === 'development' ? err : {}
    });
  }

  // P2003 - foreign key inválido
  if (err.code === 'P2003') {
    const field = err.meta?.field_name || '';
    const fieldLabel = fieldMap[field] || field || 'una opción seleccionada';
    return res.status(400).render('errors/error', {
      title: 'Error de Datos',
      message: `Valor inválido en: ${fieldLabel}. Verifica que el puesto, área u horario existan en los catálogos.`,
      error: process.env.NODE_ENV === 'development' ? err : {}
    });
  }

  // P2025 - registro no encontrado
  if (err.code === 'P2025') {
    return res.status(404).render('errors/404', {
      title: 'No Encontrado',
      message: 'El registro solicitado no existe'
    });
  }

  // Error genérico
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Error interno del servidor';

  res.status(statusCode).render('errors/error', {
    title: 'Error',
    message: message,
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
};

// Clase para errores personalizados
export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default { notFound, errorHandler, AppError };
