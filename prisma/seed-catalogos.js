/**
 * Seed de Catálogos: Incidencias
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
    Con_Goce_Sueldo: false,
    Requiere_Documento: true,
    Afecta_Puntualidad: false,
    Afecta_Asistencia: false,
    Dias_Maximos: null
  },
  {
    Codigo: 'INCAP_RT',
    Nombre: 'Incapacidad por Riesgo de Trabajo',
    Descripcion: 'Incapacidad IMSS por accidente o enfermedad laboral',
    Con_Goce_Sueldo: true,
    Requiere_Documento: true,
    Afecta_Puntualidad: false,
    Afecta_Asistencia: false,
    Dias_Maximos: null
  },
  {
    Codigo: 'INCAP_MAT',
    Nombre: 'Incapacidad por Maternidad',
    Descripcion: 'Incapacidad IMSS por maternidad (84 días)',
    Con_Goce_Sueldo: true,
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
