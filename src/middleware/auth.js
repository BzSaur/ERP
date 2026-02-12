import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcryptjs';
import prisma from '../config/database.js';
import { logAccess } from '../config/logger.js';

// ============================================================
// NORMALIZAR NOMBRE DE ROL PARA COMPARACIÓN
// ============================================================
const normalizeRole = (roleName) => {
  if (!roleName) return '';
  return roleName.toUpperCase().replace(/\s+/g, '_');
};

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
  
  // Log de intento de acceso no autenticado
  logAccess.unauthorized(req.ip, req.originalUrl, 'Not authenticated');
  
  req.session.returnTo = req.originalUrl;
  res.redirect('/auth/login');
};

// Verificar si el usuario tiene rol específico
export const hasRole = (...roles) => {
  return (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.redirect('/auth/login');
    }

    const userRole = normalizeRole(req.user?.rol?.Nombre_Rol);
    const normalizedRoles = roles.map(r => normalizeRole(r));
    
    // SUPER_ADMIN siempre tiene acceso a todo
    if (userRole === 'SUPER_ADMIN' || userRole === 'SUPERADMINISTRADOR') {
      return next();
    }
    
    if (normalizedRoles.includes(userRole)) {
      return next();
    }

    // Log de acceso denegado por falta de permisos
    logAccess.unauthorized(
      req.ip,
      req.originalUrl,
      `Insufficient permissions: required [${roles.join(', ')}], has ${userRole}`
    );

    res.status(403).render('errors/403', {
      title: 'Acceso Denegado',
      message: 'No tienes permisos para acceder a esta sección'
    });
  };
};

// Verificar si es admin
export const isAdmin = (req, res, next) => {
  return hasRole('SUPER_ADMIN', 'SuperAdministrador', 'ADMIN', 'Administrador')(req, res, next);
};

// Verificar si es SuperAdmin (solo SUPER_ADMIN)
export const isSuperAdmin = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/auth/login');
  }
  const userRole = normalizeRole(req.user?.rol?.Nombre_Rol);
  if (userRole === 'SUPER_ADMIN' || userRole === 'SUPERADMINISTRADOR') {
    return next();
  }
  
  // Log de acceso denegado a zona SuperAdmin
  logAccess.unauthorized(
    req.ip,
    req.originalUrl,
    `SuperAdmin access required, user has ${userRole}`
  );
  
  res.status(403).render('errors/403', {
    title: 'Acceso Denegado',
    message: 'Solo SuperAdministradores pueden acceder a esta sección'
  });
};

// Verificar si es RH o ADMIN (todos los permisos excepto Administración)
export const isRH = (req, res, next) => {
  return hasRole('SUPER_ADMIN', 'SuperAdministrador', 'ADMIN', 'Administrador', 'RH', 'Recursos Humanos', 'RECURSOS_HUMANOS')(req, res, next);
};

// Verificar si es ADMIN o RH (para acceso completo sin Administración)
export const isAdminOrRH = (req, res, next) => {
  return hasRole('SUPER_ADMIN', 'ADMIN', 'Administrador', 'RH', 'Recursos Humanos', 'RECURSOS_HUMANOS')(req, res, next);
};

// Verificar si puede gestionar empleados (ADMIN, RH, CONSULTA)
export const canManageEmployees = (req, res, next) => {
  return hasRole('SUPER_ADMIN', 'ADMIN', 'Administrador', 'RH', 'Recursos Humanos', 'RECURSOS_HUMANOS', 'CONSULTA')(req, res, next);
};

export default passport;
