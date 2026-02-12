import { PrismaClient } from '@prisma/client';

// Instancia global de Prisma para evitar múltiples conexiones
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: ['error', 'warn'], // ❌ NUNCA logear 'query' - expone datos sensibles
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Función para probar la conexión
export async function testConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Conexión a base de datos establecida');
    return true;
  } catch (error) {
    console.error('❌ Error de conexión a base de datos:', error);
    return false;
  }
}

// Función para cerrar la conexión
export async function closeConnection() {
  await prisma.$disconnect();
  console.log('🔌 Conexión a base de datos cerrada');
}

export default prisma;
