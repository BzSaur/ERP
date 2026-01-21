import express from 'express';
import session from 'express-session';
import flash from 'connect-flash';
import expressLayouts from 'express-ejs-layouts';
import path from 'path';
import { fileURLToPath } from 'url';
import passport from './middleware/auth.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ============================================================
// CONFIGURACIÓN DE MIDDLEWARES
// ============================================================

// Parsear body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
// CONFIGURACIÓN DE SESIÓN
// ============================================================
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret-key-development',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 24 horas
  }
}));

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
  res.locals.appName = process.env.APP_NAME || 'ERP - Recursos Humanos';
  res.locals.currentPath = req.path;
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
