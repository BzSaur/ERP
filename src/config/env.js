/**
 * Validación de Variables de Entorno
 * Este archivo asegura que todas las variables críticas estén configuradas
 * antes de iniciar la aplicación.
 */

// ============================================================
// VARIABLES REQUERIDAS
// ============================================================

const requiredEnvVars = [
  'DATABASE_URL',
  'SESSION_SECRET'
];

const optionalEnvVars = {
  'NODE_ENV': 'development',
  'PORT': '3001',
  'HOST': 'localhost',
  'APP_NAME': 'ERP - Recursos Humanos',
  'LOG_ENCRYPTION_KEY': null // Se generará si no existe
};

// ============================================================
// VALIDACIÓN
// ============================================================

export function validateEnv() {
  const missing = [];
  const warnings = [];

  // Verificar variables requeridas
  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  // Aplicar valores por defecto para opcionales
  for (const [varName, defaultValue] of Object.entries(optionalEnvVars)) {
    if (!process.env[varName] && defaultValue !== null) {
      process.env[varName] = defaultValue;
      warnings.push(`${varName} no definida, usando valor por defecto: ${defaultValue}`);
    }
  }

  // Validaciones específicas
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
    warnings.push('SESSION_SECRET debe tener al menos 32 caracteres para mayor seguridad');
  }

  if (process.env.NODE_ENV === 'production') {
    // Validaciones adicionales para producción
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'secret-key-development') {
      missing.push('SESSION_SECRET (producción requiere un valor seguro)');
    }
  }

  // Reportar resultados
  if (warnings.length > 0) {
    console.log('');
    console.log('⚠️  Advertencias de configuración:');
    warnings.forEach(w => console.log(`   - ${w}`));
  }

  if (missing.length > 0) {
    console.error('');
    console.error('❌ Variables de entorno requeridas no configuradas:');
    missing.forEach(v => console.error(`   - ${v}`));
    console.error('');
    console.error('💡 Crea un archivo .env en la raíz del proyecto con estas variables.');
    console.error('   Ejemplo:');
    console.error('   DATABASE_URL="postgresql://user:pass@localhost:5432/erp_rh"');
    console.error('   SESSION_SECRET="tu-clave-secreta-de-al-menos-32-caracteres"');
    console.error('');
    
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.warn('⚠️  Continuando en modo desarrollo con valores inseguros...');
    }
  }

  return {
    isValid: missing.length === 0,
    missing,
    warnings
  };
}

// ============================================================
// CONFIGURACIÓN EXPORTADA
// ============================================================

export const config = {
  // Base de datos
  databaseUrl: process.env.DATABASE_URL,
  
  // Servidor
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || 'localhost',
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Aplicación
  appName: process.env.APP_NAME || 'ERP - Recursos Humanos',
  
  // Seguridad
  sessionSecret: process.env.SESSION_SECRET || 'insecure-dev-secret-change-in-production',
  logEncryptionKey: process.env.LOG_ENCRYPTION_KEY,
  
  // Helpers
  isDevelopment: process.env.NODE_ENV !== 'production',
  isProduction: process.env.NODE_ENV === 'production'
};

export default config;
