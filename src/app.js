import express from 'express';
import session from 'express-session';
import flash from 'connect-flash';
import expressLayouts from 'express-ejs-layouts';
import path from 'path';
import { fileURLToPath } from 'url';
import passport from './middleware/auth.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { helmetConfig, apiLimiter, getSessionConfig } from './config/security.js';
import config from './config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ============================================================
// SEGURIDAD - Headers y Rate Limiting
// ============================================================
app.use(helmetConfig);
app.use('/api', apiLimiter); // Rate limiting para endpoints API

// ============================================================
// CONFIGURACIÓN DE MIDDLEWARES
// ============================================================

// Parsear body
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Archivos estáticos
app.use(express.static(path.join(__dirname, '../public')));

// Configuración de vistas EJS con Layouts
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// ============================================================
// CONFIGURACIÓN DE SESIÓN SEGURA
// ============================================================
const sessionConfig = getSessionConfig(config.sessionSecret);
app.use(session(sessionConfig));

// ============================================================
// CONFIGURACIÓN DE PASSPORT
// ============================================================
app.use(passport.initialize());
app.use(passport.session());

// ============================================================
// CONFIGURACIÓN DE FLASH MESSAGES
// ============================================================
app.use(flash());

// ============================================================
// VARIABLES GLOBALES PARA VISTAS
// ============================================================
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.appName = config.appName;
  res.locals.currentPath = req.path;
  res.locals.currentYear = new Date().getFullYear();
  // Flash messages - join arrays into strings for easier template usage
  const successMsgs = req.flash('success');
  const errorMsgs = req.flash('error');
  const infoMsgs = req.flash('info');
  const warningMsgs = req.flash('warning');
  res.locals.messages = {
    success: successMsgs.length > 0 ? successMsgs.join(', ') : null,
    error: errorMsgs.length > 0 ? errorMsgs.join(', ') : null,
    info: infoMsgs.length > 0 ? infoMsgs.join(', ') : null,
    warning: warningMsgs.length > 0 ? warningMsgs.join(', ') : null
  };
  next();
});

// ============================================================
// RUTAS
// ============================================================
app.use('/', routes);

// ============================================================
// MANEJO DE ERRORES
// ============================================================
app.use(notFound);
app.use(errorHandler);

export default app;
