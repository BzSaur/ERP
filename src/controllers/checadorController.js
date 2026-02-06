/**
 * Controlador de Importación de Checadores - RAM
 * Maneja la carga de archivos XLSX de los checadores biométricos
 * y muestra los resultados del cálculo de horas
 */

import multer from 'multer';
import path from 'path';
import checadorImportService from '../services/checadorImportService.js';

// ============================================================
// CONFIGURACIÓN DE MULTER (upload de archivos)
// ============================================================

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB máximo
});

// ============================================================
// VISTAS
// ============================================================

/**
 * Página principal - Formulario de importación
 */
export const index = async (req, res, next) => {
  try {
    res.render('checador/importar', {
      title: 'Importar Checador',
      user: req.user
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Procesar los archivos XLSX subidos
 */
export const procesarArchivos = async (req, res, next) => {
  try {
    const archivoRAM1 = req.files?.ram1?.[0] || null;
    const archivoRAM2 = req.files?.ram2?.[0] || null;

    if (!archivoRAM1 && !archivoRAM2) {
      req.flash('error', 'Debes subir al menos un archivo de checador (RAM1 o RAM2)');
      return res.redirect('/checador');
    }

    let datosRAM1 = null;
    let datosRAM2 = null;
    const errores = [];

    // Procesar RAM1
    if (archivoRAM1) {
      try {
        datosRAM1 = checadorImportService.parsearArchivoChecador(
          archivoRAM1.buffer,
          'RAM1'
        );
      } catch (err) {
        errores.push(`Error en archivo RAM1 (${archivoRAM1.originalname}): ${err.message}`);
      }
    }

    // Procesar RAM2
    if (archivoRAM2) {
      try {
        datosRAM2 = checadorImportService.parsearArchivoChecador(
          archivoRAM2.buffer,
          'RAM2'
        );
      } catch (err) {
        errores.push(`Error en archivo RAM2 (${archivoRAM2.originalname}): ${err.message}`);
      }
    }

    if (!datosRAM1 && !datosRAM2) {
      req.flash('error', errores.join('. '));
      return res.redirect('/checador');
    }

    // Combinar datos si hay ambos checadores
    let resultado;
    if (datosRAM1 && datosRAM2) {
      resultado = checadorImportService.combinarChecadores(datosRAM1, datosRAM2);
    } else {
      resultado = datosRAM1 || datosRAM2;
    }

    // Guardar en sesión para poder navegar entre vistas
    req.session.checadorResultado = resultado;
    req.session.checadorArchivos = {
      ram1: archivoRAM1 ? archivoRAM1.originalname : null,
      ram2: archivoRAM2 ? archivoRAM2.originalname : null
    };

    res.render('checador/resultado', {
      title: 'Resultado de Checador',
      resultado,
      archivos: req.session.checadorArchivos,
      errores,
      formatearHoras: checadorImportService.formatearHoras,
      user: req.user
    });

  } catch (error) {
    console.error('Error procesando checador:', error);
    req.flash('error', `Error al procesar archivos: ${error.message}`);
    return res.redirect('/checador');
  }
};

/**
 * Ver detalle de un empleado específico
 */
export const detalleEmpleado = async (req, res, next) => {
  try {
    const { idChecador } = req.params;
    const resultado = req.session.checadorResultado;

    if (!resultado) {
      req.flash('error', 'No hay datos de checador cargados. Por favor importe los archivos primero.');
      return res.redirect('/checador');
    }

    const empleado = resultado.empleados.find(
      e => e.idChecador === parseInt(idChecador, 10)
    );

    if (!empleado) {
      req.flash('error', `Empleado con ID de checador ${idChecador} no encontrado`);
      return res.redirect('/checador');
    }

    res.render('checador/detalle-empleado', {
      title: `Detalle - ${empleado.nombre}`,
      empleado,
      rangoFechas: resultado.rangoFechas,
      formatearHoras: checadorImportService.formatearHoras,
      user: req.user
    });

  } catch (error) {
    next(error);
  }
};

export default {
  index,
  procesarArchivos,
  detalleEmpleado,
  upload
};
