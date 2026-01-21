import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcryptjs';
import prisma from '../config/database.js';

// ============================================================
// CONFIGURACIÓN DE PASSPORT LOCAL
// ============================================================
passport.use(new LocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'password'
  },
  async (email, password, done) => {
    try {
      // Buscar usuario por email
      const usuario = await prisma.app_Usuarios.findUnique({
        where: { Email_Office365: email },
        include: {
          rol: true,
          empleado: true
        }
      });

      // Usuario no encontrado
      if (!usuario) {
        return done(null, false, { message: 'Usuario o contraseña incorrectos' });
      }

      // Usuario inactivo
      if (!usuario.Activo) {
        return done(null, false, { message: 'Usuario desactivado. Contacte al administrador.' });
      }

      // Verificar contraseña
      const isValidPassword = await bcrypt.compare(password, usuario.Password);
      if (!isValidPassword) {
        return done(null, false, { message: 'Usuario o contraseña incorrectos' });
      }

      // Actualizar último acceso
      await prisma.app_Usuarios.update({
        where: { ID_Usuario: usuario.ID_Usuario },
        data: { Ultimo_Acceso: new Date() }
      });

      return done(null, usuario);
    } catch (error) {
      return done(error);
    }
  }
));

// Serializar usuario en sesión
passport.serializeUser((user, done) => {
  done(null, user.ID_Usuario);
});

// Deserializar usuario de sesión
passport.deserializeUser(async (id, done) => {
  try {
    const usuario = await prisma.app_Usuarios.findUnique({
      where: { ID_Usuario: id },
      include: {
        rol: true,
        empleado: true
      }
    });
    done(null, usuario);
  } catch (error) {
    done(error, null);
  }
});

// ============================================================
// MIDDLEWARES DE AUTENTICACIÓN
// ============================================================

// Verificar si el usuario está autenticado
export const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  res.redirect('/auth/login');
};

// Verificar si el usuario tiene rol específico
export const hasRole = (...roles) => {
  return (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.redirect('/auth/login');
    }

    const userRole = req.user?.rol?.Nombre_Rol;
    
    if (roles.includes(userRole) || userRole === 'SUPER_ADMIN') {
      return next();
    }

    res.status(403).render('errors/403', {
      title: 'Acceso Denegado',
      message: 'No tienes permisos para acceder a esta sección'
    });
  };
};

// Verificar si es admin
export const isAdmin = (req, res, next) => {
  return hasRole('SuperAdministrador', 'Administrador', 'SUPER_ADMIN', 'ADMIN')(req, res, next);
};

// Verificar si es SuperAdmin
export const isSuperAdmin = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/auth/login');
  }

  const userRole = req.user?.rol?.Nombre_Rol;
  
  if (userRole === 'SuperAdministrador' || userRole === 'SUPER_ADMIN') {
    return next();
  }

  res.status(403).render('errors/403', {
    title: 'Acceso Denegado',
    message: 'Solo SuperAdministradores pueden acceder a esta sección'
  });
};

// Verificar si es RH o superior
export const isRH = (req, res, next) => {
  return hasRole('SuperAdministrador', 'Administrador', 'RH', 'SUPER_ADMIN', 'ADMIN')(req, res, next);
};

export default passport;
