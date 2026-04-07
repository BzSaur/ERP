/**
 * Controlador de Importación de Checadores - RAM
 * Maneja la carga de archivos XLSX de los checadores biométricos
 * y muestra los resultados del cálculo de horas
 */

import multer from 'multer';
import path from 'path';
import checadorImportService from '../services/checadorImportService.js';
import { emparejarEmpleados, guardarEnBaseDatos, calcularExtrasMixtos, formatearHoras } from '../services/checadorImportService.js';

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
      return res.redirect('/checador?error=' + encodeURIComponent('Debes subir al menos un archivo de checador (RAM1 o RAM2)'));
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
      return res.redirect('/checador?error=' + encodeURIComponent(errores.join('. ')));
    }

    // Combinar datos si hay ambos checadores
    let resultado;
    if (datosRAM1 && datosRAM2) {
      resultado = checadorImportService.combinarChecadores(datosRAM1, datosRAM2);
    } else {
      resultado = datosRAM1 || datosRAM2;
    }

    // Emparejar empleados del checador con empleados del sistema
    let matchingData = { matching: [], noMatcheados: [], totalDB: 0 };
    try {
      matchingData = await emparejarEmpleados(resultado.empleados);
    } catch (err) {
      errores.push(`Error al emparejar empleados con el sistema: ${err.message}`);
    }

    // Calcular extras para empleados mixtos
    let extrasMixtos = [];
    try {
      extrasMixtos = await calcularExtrasMixtos(resultado, matchingData);
    } catch (err) {
      errores.push(`Error al calcular extras mixtos: ${err.message}`);
    }

    // Guardar en sesión para poder navegar entre vistas
    req.session.checadorResultado = resultado;
    req.session.checadorMatching = matchingData;
    req.session.checadorExtrasMixtos = extrasMixtos;
    req.session.checadorArchivos = {
      ram1: archivoRAM1 ? archivoRAM1.originalname : null,
      ram2: archivoRAM2 ? archivoRAM2.originalname : null
    };

    res.render('checador/resultado', {
      title: 'Resultado de Checador',
      resultado,
      matchingData,
      extrasMixtos,
      archivos: req.session.checadorArchivos,
      errores,
      formatearHoras,
      user: req.user
    });

  } catch (error) {
    console.error('Error procesando checador:', error);
    return res.redirect('/checador?error=' + encodeURIComponent(`Error al procesar archivos: ${error.message}`));
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
      return res.redirect('/checador?error=' + encodeURIComponent('No hay datos de checador cargados. Por favor importe los archivos primero.'));
    }

    const empleado = resultado.empleados.find(
      e => e.idChecador === parseInt(idChecador, 10)
    );

    if (!empleado) {
      return res.redirect('/checador?error=' + encodeURIComponent(`Empleado con ID de checador ${idChecador} no encontrado`));
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

/**
 * Guardar los resultados del checador en la base de datos
 */
export const guardarResultados = async (req, res, next) => {
  try {
    const resultado = req.session.checadorResultado;
    const matchingData = req.session.checadorMatching;

    if (!resultado || !matchingData) {
      return res.redirect('/checador?error=' + encodeURIComponent('No hay datos de checador para guardar. Importe los archivos primero.'));
    }

    if (matchingData.matching.length === 0) {
      return res.redirect('/checador?error=' + encodeURIComponent('No se encontraron empleados vinculados con el sistema. No hay datos para guardar.'));
    }

    const resumen = await guardarEnBaseDatos(resultado, matchingData, req.user.ID_Usuario);

    // Limpiar datos de sesión
    delete req.session.checadorResultado;
    delete req.session.checadorMatching;
    delete req.session.checadorExtrasMixtos;
    delete req.session.checadorArchivos;

    // Construir mensaje de resultado
    let mensaje = `Se guardaron ${resumen.guardados} empleados (${resumen.diasGuardados} días) en el sistema.`;
    if (resumen.noMatcheados > 0) {
      mensaje += ` ${resumen.noMatcheados} empleados no se pudieron vincular.`;
    }
    if (resumen.errores.length > 0) {
      mensaje += ` ${resumen.errores.length} errores durante el guardado: ${resumen.errores.map(e => `${e.empleado}: ${e.error}`).join('; ')}`;
    }

    return res.redirect('/checador?success=' + encodeURIComponent(mensaje));

  } catch (error) {
    console.error('Error guardando checador:', error);
    return res.redirect('/checador?error=' + encodeURIComponent(`Error al guardar en base de datos: ${error.message}`));
  }
};

export default {
  index,
  procesarArchivos,
  detalleEmpleado,
  guardarResultados,
  upload
};