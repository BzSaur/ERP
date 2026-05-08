import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import pg from 'pg';


const isProduction = process.env.NODE_ENV === 'production';
const enableHsts = process.env.ENABLE_HSTS
  ? process.env.ENABLE_HSTS === 'true'
  : isProduction;
const enableCspHttpsUpgrade = process.env.CSP_UPGRADE_INSECURE_REQUESTS === 'true';
const forceSecureCookie = process.env.SESSION_COOKIE_SECURE
  ? process.env.SESSION_COOKIE_SECURE === 'true'
  : null;

// ============================================================
// CONFIGURACIÓN DE HELMET (Seguridad de headers)
// ============================================================
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
      // Prevent HTTP deployments from being auto-upgraded to HTTPS by CSP.
      upgradeInsecureRequests: enableCspHttpsUpgrade ? [] : null
    }
  },
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
  crossOriginEmbedderPolicy: false,
  hsts: enableHsts
    ? {
        maxAge: 31536000, // 1 año
        includeSubDomains: true,
        preload: true
      }
    : false
});

// ============================================================
// RATE LIMITING (Protección contra fuerza bruta)
// ============================================================
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 intentos
  message: { error: 'Demasiados intentos de inicio de sesión, intenta en 15 minutos' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).render('error', {
      title: 'Demasiados intentos',
      message: 'Has excedido el límite de intentos de inicio de sesión. Espera 15 minutos.'
    });
  }
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas solicitudes desde esta IP' },
  standardHeaders: true,
  legacyHeaders: false
});

export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 3, // más restrictivo
  message: { error: 'Demasiadas solicitudes de recuperación' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).render('error', {
      title: 'Demasiadas solicitudes',
      message: 'Has excedido el límite de recuperación de contraseña. Intenta más tarde.'
    });
  }
});

// ============================================================
// CONFIGURACIÓN DE SESIÓN SEGURA
// ============================================================
export const getSessionConfig = (secret) => {
  if (!secret || secret.length < 32) {
    throw new Error(
      '[FATAL] SESSION_SECRET no configurado o tiene menos de 32 caracteres. ' +
      'El sistema no puede arrancar de forma segura.'
    );
  }

  const PgSession = connectPgSimple(session);

  const sessionPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });

  return {
    store: new PgSession({
      pool: sessionPool,
      tableName: 'user_sessions',
      createTableIfMissing: true,
    }),
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: forceSecureCookie ?? (isProduction ? 'auto' : false),
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 10 * 60 * 1000, // 10 minutos (AP-VITA-17)
      path: '/',  // rutas de la app
    },
    name: 'erp_rh_session',
  };
};

// ============================================================
// CIFRADO DE LOGS SENSIBLES
// ============================================================
export function encryptLog(data, encryptionKey) {
  try {
    const key = Buffer.from(encryptionKey, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      iv: iv.toString('hex'),
      encrypted: encrypted
    };
  } catch (err) {
    console.error('Error cifrando log:', err.message);
    return null;
  }
}

export function decryptLog(encryptedData, encryptionKey) {
  try {
    const key = Buffer.from(encryptionKey, 'hex');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      key,
      Buffer.from(encryptedData.iv, 'hex')
    );
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Error descifrando log:', err.message);
    return null;
  }
}

// ============================================================
// HASH BCRYPT
// ============================================================
export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// ============================================================
// GENERAR CLAVE DE CIFRADO
// ============================================================
export function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

// ============================================================
// VALIDACIÓN DE IP (Para detectar hijacking de sesión)
// ============================================================
export function protectSession(req, res, next) {
  if (req.session && req.session.user) {
    // Validar que la IP no haya cambiado
    if (!req.session._ip) {
      req.session._ip = req.ip;
    } else if (req.session._ip !== req.ip) {
      // IP cambió durante la sesión - posible hijacking
      console.warn(`⚠️ Posible hijacking de sesión: IP cambió de ${req.session._ip} a ${req.ip}`);
      req.session.destroy((err) => {
        if (err) console.error('Error destruyendo sesión:', err);
      });
      return res.redirect('/login?error=session_expired');
    }
  }
  next();
}

// ============================================================
// SANITIZAR ENTRADA
// ============================================================
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  
  return input
    .replace(/[<>]/g, '') // Prevenir XSS básico
    .trim();
}

export function sanitizeObject(obj) {
  const sanitized = {};
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      sanitized[key] = sanitizeInput(obj[key]);
    } else {
      sanitized[key] = obj[key];
    }
  }
  return sanitized;
}

// ------------------ Politica de contraseñas
// Constantes

export const PASSWORD_POLICY = {
  MIN_LENGTH: 12,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBER: true,
  REQUIRE_SPECIAL: true,
  HISTORY_LIMIT: 10,
  VERSION: 2
};

// Validacion
export function validatePasswordPolicy(password) {
  if (!password || password.length < PASSWORD_POLICY.MIN_LENGTH) {
    return 'La contraseña debe tener al menos 12 caracteres.';
  }

  if (PASSWORD_POLICY.REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
    return 'Debe incluir al menos una letra mayúscula.';
  }

  if (PASSWORD_POLICY.REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
    return 'Debe incluir al menos una letra minúscula.';
  }

  if (PASSWORD_POLICY.REQUIRE_NUMBER && !/[0-9]/.test(password)) {
    return 'Debe incluir al menos un número.';
  }

  if (PASSWORD_POLICY.REQUIRE_SPECIAL && !/[^A-Za-z0-9]/.test(password)) {
    return 'Debe incluir al menos un carácter especial.';
  }

  return null;
}

//historial de contraseñas
export async function validatePasswordHistory(password, history) {
  for (const item of history) {
    const reused = await bcrypt.compare(password, item.PasswordHash);
    if (reused) {
      return 'No puedes reutilizar ninguna de tus últimas 10 contraseñas.';
    }
  }
  return null;
}


//funcion central, Orquestadora de la politica
export async function enforcePasswordPolicy(password, history = []) {
  // Validación de complejidad
  const policyError = validatePasswordPolicy(password);
  if (policyError) return policyError;

  // Validación de historial
  if (history.length > 0) {
    const historyError = await validatePasswordHistory(password, history);
    if (historyError) return historyError;
  }

  return null;
}

// ============================================================
// CSRF PROTECTION
// ============================================================
export function generateCsrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }

  res.locals.csrfToken = req.session.csrfToken;
  next();
}

export function csrfProtection(req, res, next) {
  const sessionToken = req.session?.csrfToken;
  const bodyToken = req.body?._csrf;

  if (!sessionToken || !bodyToken) {
    return res.status(403).render('errors/403', {
      title: 'Solicitud inválida',
      message: 'Token CSRF faltante o inválido.'
    });
  }

  const sessionBuffer = Buffer.from(sessionToken);
  const bodyBuffer = Buffer.from(bodyToken);

  if (
    sessionBuffer.length !== bodyBuffer.length ||
    !crypto.timingSafeEqual(sessionBuffer, bodyBuffer)
  ) {
    return res.status(403).render('errors/403', {
      title: 'Solicitud inválida',
      message: 'Token CSRF inválido.'
    });
  }

  next();
}


// ============================================================
// CSP NONCE MIDDLEWARE
// ============================================================

export function cspNonce(req, res, next) {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
}

export const getHelmetConfig = (nonce) => helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", `'nonce-${nonce}'`, "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", `'nonce-${nonce}'`, "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
      upgradeInsecureRequests: enableCspHttpsUpgrade ? [] : null
    }
  },
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
  crossOriginEmbedderPolicy: false,
  hsts: enableHsts
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false
});