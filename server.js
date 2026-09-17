import 'dotenv/config';
import { validateEnv, config } from './src/config/env.js';
import app from './src/app.js';
import { testConnection } from './src/config/database.js';
import { iniciarCronReporteAsistencia } from './src/services/reporteAsistenciaCronService.js';

// ============================================================
// VALIDAR VARIABLES DE ENTORNO
// ============================================================
validateEnv();

const { port: PORT, host: HOST, nodeEnv } = config;

// ============================================================
// INICIAR SERVIDOR
// ============================================================
async function startServer() {
  try {
    // Probar conexión a base de datos
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.error('❌ No se pudo conectar a la base de datos');
      console.log('💡 Asegúrate de que PostgreSQL esté corriendo y las credenciales sean correctas');
      process.exit(1);
    }

    await iniciarCronReporteAsistencia();

    // Iniciar servidor
    app.listen(PORT, () => {
      console.log('');
      console.log('============================================================');
      console.log('🚀 ERP - GESTIÓN DE RECURSOS HUMANOS');
      console.log('============================================================');
      console.log(`📍 Servidor corriendo en: http://${HOST}:${PORT}`);
      console.log(`🌍 Entorno: ${nodeEnv}`);
      console.log('============================================================');
      console.log('');
    });
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
}

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Error no capturado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada no manejada:', reason);
  process.exit(1);
});

// Iniciar
startServer();
