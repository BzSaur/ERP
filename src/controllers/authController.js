import passport from 'passport';
import { logAccess } from '../config/logger.js';

// ============================================================
// CONTROLADOR DE AUTENTICACIÓN
// ============================================================

// GET /auth/login - Mostrar formulario de login
export const showLogin = (req, res) => {
  // Si ya está autenticado, redirigir al home
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  
  res.render('login', {
    title: 'Iniciar Sesión',
    error: req.flash ? req.flash('error') : null,
    layout: false  // Desactivar layout para login
  });
};

// POST /auth/login - Procesar login
export const processLogin = (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      return next(err);
    }
    
    if (!user) {
      // Log de login fallido
      logAccess.login(null, req.body.email, req.ip, false, {
        userAgent: req.headers['user-agent'],
        motivoError: info?.message || 'Credenciales inválidas'
      });
      
      return res.render('login', {
        title: 'Iniciar Sesión',
        error: info?.message || 'Credenciales inválidas',
        email: req.body.email,
        layout: false  // Desactivar layout para login
      });
    }

    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }
      
      // Log de login exitoso
      logAccess.login(
        user.ID_Usuario,
        user.Email_Office365,
        req.ip,
        true,
        { userAgent: req.headers['user-agent'] }
      );
      
      // Redirigir a la URL guardada o al home
      let returnTo = req.session.returnTo || null;
      delete req.session.returnTo;

      // Si no hay returnTo, redirigir por rol a la vista principal más relevante
      if (!returnTo) {
        const rol = String(user?.rol?.Nombre_Rol || '').toUpperCase().replace(/\s+/g, '_');
        if (rol === 'SUPERADMIN' || rol === 'SUPER_ADMIN' || rol === 'SUPERADMINISTRADOR') {
          returnTo = '/configuracion';
        } else if (rol === 'ADMIN' || rol === 'ADMINISTRADOR') {
          returnTo = '/usuarios';
        } else if (rol === 'RH' || rol === 'RECURSOS_HUMANOS') {
          returnTo = '/nomina';
        } else if (rol === 'OPERADOR') {
          returnTo = '/checador';
        } else {
          returnTo = '/';
        }
      }

      return res.redirect(returnTo);
    });
  })(req, res, next);
};

// GET /auth/logout - Cerrar sesión
export const logout = (req, res, next) => {
  // Log de logout
  if (req.user) {
    logAccess.logout(
      req.user.ID_Usuario,
      req.user.Email_Office365,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );
  }
  
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.session.destroy((err) => {
      if (err) {
        console.error('Error al destruir sesión:', err);
      }
      res.redirect('/auth/login');
    });
  });
};

// GET /auth/perfil - Ver perfil del usuario
export const showPerfil = (req, res) => {
  res.render('perfil', {
    title: 'Mi Perfil',
    usuario: req.user
  });
};

export default {
  showLogin,
  processLogin,
  logout,
  showPerfil
};
