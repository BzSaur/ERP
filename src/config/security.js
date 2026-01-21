import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

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
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000, // 1 año
    includeSubDomains: true,
    preload: true
  }
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

// ============================================================
// CONFIGURACIÓN DE SESIÓN SEGURA
// ============================================================
export const getSessionConfig = (secret) => ({
  secret: secret || 'default_secret_change_in_production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Solo HTTPS en producción
    httpOnly: true, // Protege contra XSS
    sameSite: 'strict', // Protege contra CSRF
    maxAge: 1000 * 60 * 60 * 8 // 8 horas
  },
  name: 'erp_rh_session'
});

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
