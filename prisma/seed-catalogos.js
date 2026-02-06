/**
 * Seed de Catálogos de Incidencias y Tablas ISR
 * Ejecutar después de prisma migrate
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================
// TIPOS DE INCIDENCIA
// ============================================================
const tiposIncidencia = [
  {
    Codigo: 'FALTA_INJ',
    Nombre: 'Falta Injustificada',
    Descripcion: 'Ausencia sin justificación ni aviso previo',
    Con_Goce_Sueldo: false,
    Requiere_Documento: false,
    Afecta_Puntualidad: true,
    Afecta_Asistencia: true,
    Dias_Maximos: null
  },
  {
    Codigo: 'FALTA_JUST',
    Nombre: 'Falta Justificada',
    Descripcion: 'Ausencia con justificación comprobable',
    Con_Goce_Sueldo: false,
    Requiere_Documento: true,
    Afecta_Puntualidad: true,
    Afecta_Asistencia: true,
    Dias_Maximos: null
  },
  {
    Codigo: 'PERMISO_CG',
    Nombre: 'Permiso Con Goce de Sueldo',
    Descripcion: 'Permiso autorizado con pago de salario',
    Con_Goce_Sueldo: true,
    Requiere_Documento: false,
    Afecta_Puntualidad: false,
    Afecta_Asistencia: false,
    Dias_Maximos: 3
  },
  {
    Codigo: 'PERMISO_SG',
    Nombre: 'Permiso Sin Goce de Sueldo',
    Descripcion: 'Permiso autorizado sin pago de salario',
    Con_Goce_Sueldo: false,
    Requiere_Documento: false,
    Afecta_Puntualidad: false,
    Afecta_Asistencia: true,
    Dias_Maximos: 15
  },
  {
    Codigo: 'INCAP_EG',
    Nombre: 'Incapacidad por Enfermedad General',
    Descripcion: 'Incapacidad IMSS por enfermedad general',
    Con_Goce_Sueldo: false, // Paga IMSS al 60%
    Requiere_Documento: true,
    Afecta_Puntualidad: false,
    Afecta_Asistencia: false,
    Dias_Maximos: null
  },
  {
    Codigo: 'INCAP_RT',
    Nombre: 'Incapacidad por Riesgo de Trabajo',
    Descripcion: 'Incapacidad IMSS por accidente o enfermedad laboral',
    Con_Goce_Sueldo: true, // Paga IMSS al 100%
    Requiere_Documento: true,
    Afecta_Puntualidad: false,
    Afecta_Asistencia: false,
    Dias_Maximos: null
  },
  {
    Codigo: 'INCAP_MAT',
    Nombre: 'Incapacidad por Maternidad',
    Descripcion: 'Incapacidad IMSS por maternidad (84 días)',
    Con_Goce_Sueldo: true, // Paga IMSS al 100%
    Requiere_Documento: true,
    Afecta_Puntualidad: false,
    Afecta_Asistencia: false,
    Dias_Maximos: 84
  },
  {
    Codigo: 'LIC_PAT',
    Nombre: 'Licencia de Paternidad',
    Descripcion: 'Licencia por nacimiento de hijo (5 días LFT)',
    Con_Goce_Sueldo: true,
    Requiere_Documento: true,
    Afecta_Puntualidad: false,
    Afecta_Asistencia: false,
    Dias_Maximos: 5
  },
  {
    Codigo: 'LIC_LUTO',
    Nombre: 'Licencia por Luto',
    Descripcion: 'Licencia por fallecimiento de familiar directo',
    Con_Goce_Sueldo: true,
    Requiere_Documento: true,
    Afecta_Puntualidad: false,
    Afecta_Asistencia: false,
    Dias_Maximos: 3
  },
  {
    Codigo: 'LIC_MATRIM',
    Nombre: 'Licencia por Matrimonio',
    Descripcion: 'Licencia por matrimonio civil del empleado',
    Con_Goce_Sueldo: true,
    Requiere_Documento: true,
    Afecta_Puntualidad: false,
    Afecta_Asistencia: false,
    Dias_Maximos: 3
  },
  {
    Codigo: 'DIA_ECON',
    Nombre: 'Día Económico',
    Descripcion: 'Día personal con goce de sueldo según política',
    Con_Goce_Sueldo: true,
    Requiere_Documento: false,
    Afecta_Puntualidad: false,
    Afecta_Asistencia: false,
    Dias_Maximos: 2
  },
  {
    Codigo: 'SUSPENSION',
    Nombre: 'Suspensión Laboral',
    Descripcion: 'Suspensión disciplinaria sin goce de sueldo',
    Con_Goce_Sueldo: false,
    Requiere_Documento: true,
    Afecta_Puntualidad: true,
    Afecta_Asistencia: true,
    Dias_Maximos: 8
  }
];

// ============================================================
// TABLAS ISR 2026 - MENSUAL
// Según tablas del SAT (ejemplo - verificar con tablas oficiales)
// ============================================================
const tablasISR2026Mensual = [
  { Limite_Inferior: 0.01, Limite_Superior: 746.04, Cuota_Fija: 0.00, Porcentaje_Excedente: 0.0192 },
  { Limite_Inferior: 746.05, Limite_Superior: 6332.05, Cuota_Fija: 14.32, Porcentaje_Excedente: 0.0640 },
  { Limite_Inferior: 6332.06, Limite_Superior: 11128.01, Cuota_Fija: 371.83, Porcentaje_Excedente: 0.1088 },
  { Limite_Inferior: 11128.02, Limite_Superior: 12935.82, Cuota_Fija: 893.63, Porcentaje_Excedente: 0.1600 },
  { Limite_Inferior: 12935.83, Limite_Superior: 15487.71, Cuota_Fija: 1182.88, Porcentaje_Excedente: 0.1792 },
  { Limite_Inferior: 15487.72, Limite_Superior: 31236.49, Cuota_Fija: 1640.18, Porcentaje_Excedente: 0.2136 },
  { Limite_Inferior: 31236.50, Limite_Superior: 49233.00, Cuota_Fija: 5004.12, Porcentaje_Excedente: 0.2352 },
  { Limite_Inferior: 49233.01, Limite_Superior: 93993.90, Cuota_Fija: 9236.89, Porcentaje_Excedente: 0.3000 },
  { Limite_Inferior: 93993.91, Limite_Superior: 125325.20, Cuota_Fija: 22665.17, Porcentaje_Excedente: 0.3200 },
  { Limite_Inferior: 125325.21, Limite_Superior: 375975.61, Cuota_Fija: 32691.18, Porcentaje_Excedente: 0.3400 },
  { Limite_Inferior: 375975.62, Limite_Superior: 999999999.99, Cuota_Fija: 117912.32, Porcentaje_Excedente: 0.3500 }
];

// ============================================================
// TABLAS ISR 2026 - QUINCENAL
// ============================================================
const tablasISR2026Quincenal = [
  { Limite_Inferior: 0.01, Limite_Superior: 373.02, Cuota_Fija: 0.00, Porcentaje_Excedente: 0.0192 },
  { Limite_Inferior: 373.03, Limite_Superior: 3166.03, Cuota_Fija: 7.16, Porcentaje_Excedente: 0.0640 },
  { Limite_Inferior: 3166.04, Limite_Superior: 5564.01, Cuota_Fija: 185.92, Porcentaje_Excedente: 0.1088 },
  { Limite_Inferior: 5564.02, Limite_Superior: 6467.91, Cuota_Fija: 446.82, Porcentaje_Excedente: 0.1600 },
  { Limite_Inferior: 6467.92, Limite_Superior: 7743.86, Cuota_Fija: 591.44, Porcentaje_Excedente: 0.1792 },
  { Limite_Inferior: 7743.87, Limite_Superior: 15618.25, Cuota_Fija: 820.09, Porcentaje_Excedente: 0.2136 },
  { Limite_Inferior: 15618.26, Limite_Superior: 24616.50, Cuota_Fija: 2502.06, Porcentaje_Excedente: 0.2352 },
  { Limite_Inferior: 24616.51, Limite_Superior: 46996.95, Cuota_Fija: 4618.45, Porcentaje_Excedente: 0.3000 },
  { Limite_Inferior: 46996.96, Limite_Superior: 62662.60, Cuota_Fija: 11332.59, Porcentaje_Excedente: 0.3200 },
  { Limite_Inferior: 62662.61, Limite_Superior: 187987.81, Cuota_Fija: 16345.59, Porcentaje_Excedente: 0.3400 },
  { Limite_Inferior: 187987.82, Limite_Superior: 999999999.99, Cuota_Fija: 58956.16, Porcentaje_Excedente: 0.3500 }
];

// ============================================================
// TABLAS SUBSIDIO AL EMPLEO 2026 - MENSUAL
// ============================================================
const tablasSubsidio2026Mensual = [
  { Limite_Inferior: 0.01, Limite_Superior: 1768.96, Subsidio: 407.02 },
  { Limite_Inferior: 1768.97, Limite_Superior: 2653.38, Subsidio: 406.83 },
  { Limite_Inferior: 2653.39, Limite_Superior: 3472.84, Subsidio: 406.62 },
  { Limite_Inferior: 3472.85, Limite_Superior: 3537.87, Subsidio: 392.77 },
  { Limite_Inferior: 3537.88, Limite_Superior: 4446.15, Subsidio: 382.46 },
  { Limite_Inferior: 4446.16, Limite_Superior: 4717.18, Subsidio: 354.23 },
  { Limite_Inferior: 4717.19, Limite_Superior: 5335.42, Subsidio: 324.87 },
  { Limite_Inferior: 5335.43, Limite_Superior: 6224.67, Subsidio: 294.63 },
  { Limite_Inferior: 6224.68, Limite_Superior: 7113.90, Subsidio: 253.54 },
  { Limite_Inferior: 7113.91, Limite_Superior: 7382.33, Subsidio: 217.61 },
  { Limite_Inferior: 7382.34, Limite_Superior: 999999999.99, Subsidio: 0.00 }
];

// ============================================================
// COMPETENCIAS CORE PARA EVALUACIONES
// ============================================================
const competenciasCore = [
  { Nombre: 'Puntualidad y Asistencia', Descripcion: 'Cumplimiento de horarios y asistencia regular', Tipo: 'CORE', Peso_Defecto: 1.0 },
  { Nombre: 'Trabajo en Equipo', Descripcion: 'Colaboración efectiva con compañeros', Tipo: 'CORE', Peso_Defecto: 1.0 },
  { Nombre: 'Comunicación', Descripcion: 'Claridad y efectividad en la comunicación', Tipo: 'CORE', Peso_Defecto: 1.0 },
  { Nombre: 'Responsabilidad', Descripcion: 'Cumplimiento de compromisos y tareas asignadas', Tipo: 'CORE', Peso_Defecto: 1.0 },
  { Nombre: 'Conocimiento del Puesto', Descripcion: 'Dominio de las funciones del puesto', Tipo: 'TECNICA', Peso_Defecto: 1.5 },
  { Nombre: 'Calidad del Trabajo', Descripcion: 'Precisión y calidad en los entregables', Tipo: 'TECNICA', Peso_Defecto: 1.5 },
  { Nombre: 'Productividad', Descripcion: 'Volumen y eficiencia en el trabajo', Tipo: 'TECNICA', Peso_Defecto: 1.5 },
  { Nombre: 'Iniciativa', Descripcion: 'Proactividad y propuestas de mejora', Tipo: 'TECNICA', Peso_Defecto: 1.0 },
  { Nombre: 'Liderazgo', Descripcion: 'Capacidad de guiar y motivar equipos', Tipo: 'LIDERAZGO', Peso_Defecto: 1.0 },
  { Nombre: 'Toma de Decisiones', Descripcion: 'Criterio y efectividad en decisiones', Tipo: 'LIDERAZGO', Peso_Defecto: 1.0 }
];

// ============================================================
// DÍAS FESTIVOS OFICIALES 2026 (LFT Art. 74)
// ============================================================
const diasFestivos2026 = [
  { Fecha: '2026-01-01', Nombre: 'Año Nuevo', Obligatorio: true },
  { Fecha: '2026-02-02', Nombre: 'Día de la Constitución (se mueve al lunes)', Obligatorio: true },
  { Fecha: '2026-03-16', Nombre: 'Natalicio de Benito Juárez (se mueve al lunes)', Obligatorio: true },
  { Fecha: '2026-04-02', Nombre: 'Jueves Santo', Obligatorio: false },
  { Fecha: '2026-04-03', Nombre: 'Viernes Santo', Obligatorio: false },
  { Fecha: '2026-05-01', Nombre: 'Día del Trabajo', Obligatorio: true },
  { Fecha: '2026-09-16', Nombre: 'Día de la Independencia', Obligatorio: true },
  { Fecha: '2026-11-16', Nombre: 'Revolución Mexicana (se mueve al lunes)', Obligatorio: true },
  { Fecha: '2026-12-01', Nombre: 'Transmisión del Poder Ejecutivo (cada 6 años)', Obligatorio: true },
  { Fecha: '2026-12-25', Nombre: 'Navidad', Obligatorio: true }
];

// ============================================================
// FUNCIÓN PRINCIPAL DE SEED
// ============================================================
async function seedCatalogos() {
  console.log('🌱 Iniciando seed de catálogos...\n');

  // Seed Tipos de Incidencia
  console.log('📋 Insertando tipos de incidencia...');
  for (const tipo of tiposIncidencia) {
    await prisma.cat_Tipo_Incidencia.upsert({
      where: { Codigo: tipo.Codigo },
      update: tipo,
      create: tipo
    });
  }
  console.log(`   ✅ ${tiposIncidencia.length} tipos de incidencia insertados`);

  // Seed Tablas ISR Mensual
  console.log('💰 Insertando tablas ISR 2026 (Mensual)...');
  for (const rango of tablasISR2026Mensual) {
    await prisma.tablas_ISR.upsert({
      where: {
        Anio_Fiscal_Tipo_Tabla_Limite_Inferior: {
          Anio_Fiscal: 2026,
          Tipo_Tabla: 'MENSUAL',
          Limite_Inferior: rango.Limite_Inferior
        }
      },
      update: rango,
      create: {
        Anio_Fiscal: 2026,
        Tipo_Tabla: 'MENSUAL',
        ...rango
      }
    });
  }
  console.log(`   ✅ ${tablasISR2026Mensual.length} rangos ISR mensual insertados`);

  // Seed Tablas ISR Quincenal
  console.log('💰 Insertando tablas ISR 2026 (Quincenal)...');
  for (const rango of tablasISR2026Quincenal) {
    await prisma.tablas_ISR.upsert({
      where: {
        Anio_Fiscal_Tipo_Tabla_Limite_Inferior: {
          Anio_Fiscal: 2026,
          Tipo_Tabla: 'QUINCENAL',
          Limite_Inferior: rango.Limite_Inferior
        }
      },
      update: rango,
      create: {
        Anio_Fiscal: 2026,
        Tipo_Tabla: 'QUINCENAL',
        ...rango
      }
    });
  }
  console.log(`   ✅ ${tablasISR2026Quincenal.length} rangos ISR quincenal insertados`);

  // Seed Subsidio al Empleo
  console.log('🎁 Insertando tablas de subsidio al empleo 2026...');
  for (const rango of tablasSubsidio2026Mensual) {
    await prisma.tablas_Subsidio_Empleo.upsert({
      where: {
        Anio_Fiscal_Tipo_Tabla_Limite_Inferior: {
          Anio_Fiscal: 2026,
          Tipo_Tabla: 'MENSUAL',
          Limite_Inferior: rango.Limite_Inferior
        }
      },
      update: rango,
      create: {
        Anio_Fiscal: 2026,
        Tipo_Tabla: 'MENSUAL',
        ...rango
      }
    });
  }
  console.log(`   ✅ ${tablasSubsidio2026Mensual.length} rangos de subsidio insertados`);

  // Seed Competencias
  console.log('🎯 Insertando competencias de evaluación...');
  for (const comp of competenciasCore) {
    await prisma.cat_Competencias.upsert({
      where: { ID_Competencia: competenciasCore.indexOf(comp) + 1 },
      update: comp,
      create: comp
    });
  }
  console.log(`   ✅ ${competenciasCore.length} competencias insertadas`);

  // Seed Días Festivos
  console.log('📅 Insertando días festivos 2026...');
  for (const dia of diasFestivos2026) {
    const fecha = new Date(dia.Fecha);
    await prisma.dias_Festivos.upsert({
      where: { Fecha: fecha },
      update: {
        Nombre: dia.Nombre,
        Obligatorio: dia.Obligatorio,
        Anio: 2026
      },
      create: {
        Fecha: fecha,
        Nombre: dia.Nombre,
        Obligatorio: dia.Obligatorio,
        Anio: 2026
      }
    });
  }
  console.log(`   ✅ ${diasFestivos2026.length} días festivos insertados`);

  console.log('\n✅ Seed de catálogos completado exitosamente!\n');
}

// Ejecutar
seedCatalogos()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
