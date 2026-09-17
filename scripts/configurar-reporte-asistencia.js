import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const configuraciones = [
  {
    Clave: 'REPORTES_ASISTENCIA_EMAILS',
    Valor: '',
    Descripcion: 'Correos separados por coma que reciben el Excel semanal de asistencia',
    Tipo_Dato: 'STRING'
  },
  {
    Clave: 'REPORTES_ASISTENCIA_CRON',
    Valor: '0 22 * * 4',
    Descripcion: 'Programación CRON del reporte: jueves a las 22:00',
    Tipo_Dato: 'STRING'
  },
  {
    Clave: 'REPORTES_ASISTENCIA_TZ',
    Valor: 'America/Mexico_City',
    Descripcion: 'Zona horaria del reporte de asistencia',
    Tipo_Dato: 'STRING'
  },
  {
    Clave: 'REPORTES_ASISTENCIA_ACTIVO',
    Valor: 'true',
    Descripcion: 'Activa el envío automático semanal del reporte de asistencia',
    Tipo_Dato: 'BOOLEAN'
  }
];

try {
  for (const config of configuraciones) {
    await prisma.configuracion_Nomina.upsert({
      where: { Clave: config.Clave },
      update: { Descripcion: config.Descripcion, Tipo_Dato: config.Tipo_Dato, Activo: true },
      create: { ...config, Activo: true }
    });
    console.log(`Configuración disponible: ${config.Clave}`);
  }
} finally {
  await prisma.$disconnect();
}
