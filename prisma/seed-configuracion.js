/**
 * Seed de Configuración de Nómina
 * Parámetros específicos para RAM (empresa pequeña)
 * Ejecutar: node prisma/seed-configuracion.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================
// CONFIGURACIÓN DE NÓMINA - RAM
// ============================================================
const configuracionNomina = [
  // Tipo de nómina
  {
    Clave: 'TIPO_NOMINA',
    Valor: 'SEMANAL',
    Descripcion: 'Frecuencia de pago de nómina',
    Tipo_Dato: 'STRING'
  },
  {
    Clave: 'DIA_PAGO',
    Valor: 'VIERNES',
    Descripcion: 'Día de la semana en que se paga',
    Tipo_Dato: 'STRING'
  },
  
  // Jornada y horario
  {
    Clave: 'HORA_ENTRADA',
    Valor: '08:00',
    Descripcion: 'Hora de entrada estándar',
    Tipo_Dato: 'STRING'
  },
  {
    Clave: 'HORA_SALIDA',
    Valor: '17:00',
    Descripcion: 'Hora de salida estándar',
    Tipo_Dato: 'STRING'
  },
  {
    Clave: 'HORA_COMIDA_INICIO',
    Valor: '14:00',
    Descripcion: 'Hora de inicio de comida',
    Tipo_Dato: 'STRING'
  },
  {
    Clave: 'HORA_COMIDA_FIN',
    Valor: '15:00',
    Descripcion: 'Hora de fin de comida',
    Tipo_Dato: 'STRING'
  },
  {
    Clave: 'COMIDA_CON_GOCE',
    Valor: 'false',
    Descripcion: 'Si la hora de comida es con goce de sueldo',
    Tipo_Dato: 'BOOLEAN'
  },
  {
    Clave: 'TOLERANCIA_MINUTOS',
    Valor: '15',
    Descripcion: 'Minutos de tolerancia para entrada',
    Tipo_Dato: 'INT'
  },
  {
    Clave: 'HORAS_DIARIAS',
    Valor: '8',
    Descripcion: 'Horas de jornada diaria',
    Tipo_Dato: 'INT'
  },
  {
    Clave: 'TRABAJA_SABADO',
    Valor: 'true',
    Descripcion: 'Si se trabaja los sábados',
    Tipo_Dato: 'BOOLEAN'
  },
  {
    Clave: 'HORAS_SABADO',
    Valor: '4',
    Descripcion: 'Horas de trabajo los sábados (medio día)',
    Tipo_Dato: 'INT'
  },
  
  // Impuestos y deducciones
  {
    Clave: 'CALCULAR_ISR',
    Valor: 'false',
    Descripcion: 'Si se calcula y retiene ISR (la empresa no retiene)',
    Tipo_Dato: 'BOOLEAN'
  },
  {
    Clave: 'CALCULAR_IMSS',
    Valor: 'true',
    Descripcion: 'Si se calculan cuotas IMSS obrero',
    Tipo_Dato: 'BOOLEAN'
  },
  
  // Bono de puntualidad
  {
    Clave: 'BONO_PUNTUALIDAD_ACTIVO',
    Valor: 'true',
    Descripcion: 'Si se otorga bono de puntualidad',
    Tipo_Dato: 'BOOLEAN'
  },
  {
    Clave: 'BONO_PUNTUALIDAD_MONTO',
    Valor: '50.00',
    Descripcion: 'Monto semanal del bono de puntualidad',
    Tipo_Dato: 'DECIMAL'
  },
  {
    Clave: 'BONO_PUNTUALIDAD_CHECADAS',
    Valor: '8',
    Descripcion: 'Número de checadas requeridas para bono',
    Tipo_Dato: 'INT'
  },
  {
    Clave: 'BONO_PUNTUALIDAD_DIAS',
    Valor: '6',
    Descripcion: 'Días requeridos para bono de puntualidad',
    Tipo_Dato: 'INT'
  },
  
  // Horas extra
  {
    Clave: 'HORAS_EXTRA_ACTIVO',
    Valor: 'true',
    Descripcion: 'Si se pagan horas extra',
    Tipo_Dato: 'BOOLEAN'
  },
  {
    Clave: 'HORAS_EXTRA_MAX_SEMANA',
    Valor: '9',
    Descripcion: 'Máximo de horas extra permitidas por semana',
    Tipo_Dato: 'INT'
  },
  {
    Clave: 'HORAS_EXTRA_DOBLES_LIMITE',
    Valor: '9',
    Descripcion: 'Hasta qué hora se pagan dobles (después triples)',
    Tipo_Dato: 'INT'
  },
  {
    Clave: 'HORAS_EXTRA_REQUIERE_AUTORIZACION',
    Valor: 'true',
    Descripcion: 'Si las horas extra requieren autorización previa',
    Tipo_Dato: 'BOOLEAN'
  },
  
  // Vacaciones
  {
    Clave: 'PRIMA_VACACIONAL_PCT',
    Valor: '25',
    Descripcion: 'Porcentaje de prima vacacional',
    Tipo_Dato: 'INT'
  },
  {
    Clave: 'VACACIONES_ANTICIPACION_DIAS',
    Valor: '15',
    Descripcion: 'Días de anticipación para solicitar vacaciones',
    Tipo_Dato: 'INT'
  },
  {
    Clave: 'VACACIONES_ACUMULABLES',
    Valor: 'false',
    Descripcion: 'Si se pueden acumular vacaciones de años anteriores',
    Tipo_Dato: 'BOOLEAN'
  },
  {
    Clave: 'VACACIONES_PERIODO_PROHIBIDO',
    Valor: 'DICIEMBRE',
    Descripcion: 'Mes donde no se pueden tomar vacaciones',
    Tipo_Dato: 'STRING'
  },
  
  // Aguinaldo
  {
    Clave: 'DIAS_AGUINALDO',
    Valor: '15',
    Descripcion: 'Días de aguinaldo al año',
    Tipo_Dato: 'INT'
  },
  {
    Clave: 'FECHA_PAGO_AGUINALDO',
    Valor: '20',
    Descripcion: 'Día de diciembre para pago de aguinaldo',
    Tipo_Dato: 'INT'
  },
  
  // Faltas e incidencias
  {
    Clave: 'FALTAS_PARA_RESCISION',
    Valor: '3',
    Descripcion: 'Faltas injustificadas en 30 días para rescisión',
    Tipo_Dato: 'INT'
  },
  {
    Clave: 'DIAS_ABANDONO_TRABAJO',
    Valor: '3',
    Descripcion: 'Días sin presentarse para considerar abandono',
    Tipo_Dato: 'INT'
  },
  {
    Clave: 'LICENCIA_LUTO_DIAS',
    Valor: '3',
    Descripcion: 'Días de licencia por luto (familiar directo)',
    Tipo_Dato: 'INT'
  },
  {
    Clave: 'LICENCIA_PATERNIDAD_DIAS',
    Valor: '5',
    Descripcion: 'Días de licencia de paternidad',
    Tipo_Dato: 'INT'
  },
  
  // Préstamos
  {
    Clave: 'PRESTAMOS_ACTIVO',
    Valor: 'true',
    Descripcion: 'Si se otorgan préstamos a empleados',
    Tipo_Dato: 'BOOLEAN'
  },
  {
    Clave: 'PRESTAMOS_MESES_MINIMOS',
    Valor: '3',
    Descripcion: 'Meses mínimos de antigüedad para solicitar préstamo',
    Tipo_Dato: 'INT'
  },
  {
    Clave: 'PRESTAMOS_TASA_INTERES',
    Valor: '0',
    Descripcion: 'Tasa de interés en préstamos (0 = sin interés)',
    Tipo_Dato: 'DECIMAL'
  },
  {
    Clave: 'PRESTAMOS_MONTO_MAXIMO',
    Valor: 'FINIQUITO',
    Descripcion: 'Monto máximo de préstamo (FINIQUITO = equivalente al finiquito)',
    Tipo_Dato: 'STRING'
  },
  
  // Prima dominical
  {
    Clave: 'PRIMA_DOMINICAL_PCT',
    Valor: '25',
    Descripcion: 'Porcentaje adicional por trabajar domingo',
    Tipo_Dato: 'INT'
  },
  
  // Sucursales
  {
    Clave: 'SUCURSALES',
    Valor: 'RAM1,RAM2',
    Descripcion: 'Lista de sucursales separadas por coma',
    Tipo_Dato: 'STRING'
  },
  
  // UMA vigente
  {
    Clave: 'UMA_DIARIO_2026',
    Valor: '113.14',
    Descripcion: 'Valor diario de la UMA para 2026',
    Tipo_Dato: 'DECIMAL'
  },
  {
    Clave: 'SALARIO_MINIMO_2026',
    Valor: '278.80',
    Descripcion: 'Salario mínimo diario 2026',
    Tipo_Dato: 'DECIMAL'
  }
];

// ============================================================
// FUNCIÓN DE SEED
// ============================================================
async function seedConfiguracion() {
  console.log('⚙️  Iniciando configuración de nómina para RAM...\n');

  for (const config of configuracionNomina) {
    await prisma.configuracion_Nomina.upsert({
      where: { Clave: config.Clave },
      update: {
        Valor: config.Valor,
        Descripcion: config.Descripcion,
        Tipo_Dato: config.Tipo_Dato,
        Activo: true
      },
      create: {
        Clave: config.Clave,
        Valor: config.Valor,
        Descripcion: config.Descripcion,
        Tipo_Dato: config.Tipo_Dato,
        Activo: true
      }
    });
    console.log(`   ✓ ${config.Clave} = ${config.Valor}`);
  }

  console.log(`\n✅ ${configuracionNomina.length} parámetros configurados exitosamente!\n`);
  
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  RESUMEN DE CONFIGURACIÓN                                       │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  console.log('│  Tipo de nómina:        SEMANAL (pago los viernes)              │');
  console.log('│  Horario:               08:00 - 17:00 (1hr comida sin goce)     │');
  console.log('│  Tolerancia:            15 minutos                              │');
  console.log('│  Bono puntualidad:      $50.00 (8 checadas en 6 días)           │');
  console.log('│  Horas extra:           Máx 9/semana (dobles), después triples  │');
  console.log('│  Cálculo ISR:           DESACTIVADO                             │');
  console.log('│  Aguinaldo:             15 días (pago 20 dic)                   │');
  console.log('│  Prima vacacional:      25%                                     │');
  console.log('│  Sucursales:            RAM1, RAM2                              │');
  console.log('└─────────────────────────────────────────────────────────────────┘');
}

// Ejecutar
seedConfiguracion()
  .catch((e) => {
    console.error('❌ Error en configuración:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
