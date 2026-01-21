// ============================================================
// MIDDLEWARE DE MANEJO DE ERRORES
// ============================================================

// Middleware para manejar errores 404
export const notFound = (req, res, next) => {
  res.status(404).render('errors/404', {
    title: 'Página no encontrada',
    message: `La página ${req.originalUrl} no existe`
  });
};

// Middleware para manejar errores generales
export const errorHandler = (err, req, res, next) => {
  console.error('❌ Error:', err);

  // Error de validación de Prisma
  if (err.code === 'P2002') {
    return res.status(400).render('errors/error', {
      title: 'Error de Duplicado',
      message: 'Ya existe un registro con esos datos',
      error: process.env.NODE_ENV === 'development' ? err : {}
    });
  }

  // Error de registro no encontrado
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
