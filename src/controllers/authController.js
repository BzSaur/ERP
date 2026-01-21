import passport from 'passport';

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
      
      // Redirigir a la URL guardada o al home
      const returnTo = req.session.returnTo || '/';
      delete req.session.returnTo;
      
      return res.redirect(returnTo);
    });
  })(req, res, next);
};

// GET /auth/logout - Cerrar sesión
export const logout = (req, res, next) => {
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
