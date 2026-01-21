import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando seed...');

  // ============================================================
  // 1. CREAR ROLES
  // ============================================================
  const roles = await prisma.cat_Roles.createMany({
    data: [
      { Nombre_Rol: 'SUPER_ADMIN', Descripcion: 'Acceso total al sistema' },
      { Nombre_Rol: 'ADMIN', Descripcion: 'Administrador de sistemas' },
      { Nombre_Rol: 'RH', Descripcion: 'Recursos Humanos' },
      { Nombre_Rol: 'CONSULTA', Descripcion: 'Solo lectura' }
    ],
    skipDuplicates: true
  });
  console.log('✅ Roles creados');

  // ============================================================
  // 2. CREAR ESTATUS DE EMPLEADOS
  // ============================================================
  await prisma.cat_Estatus_Empleado.createMany({
    data: [
      { Nombre_Estatus: 'ACTIVO', Descripcion: 'Empleado activo laborando' },
      { Nombre_Estatus: 'BAJA', Descripcion: 'Empleado dado de baja' },
      { Nombre_Estatus: 'INCAPACIDAD', Descripcion: 'En periodo de incapacidad' },
      { Nombre_Estatus: 'VACACIONES', Descripcion: 'En periodo vacacional' },
      { Nombre_Estatus: 'SUSPENDIDO', Descripcion: 'Suspendido temporalmente' }
    ],
    skipDuplicates: true
  });
  console.log('✅ Estatus de empleados creados');

  // ============================================================
  // 3. CREAR TIPOS DE HORARIO
  // ============================================================
  await prisma.cat_Tipo_Horario.createMany({
    data: [
      { Nombre_Horario: 'COMPLETO', Descripcion: 'Tiempo completo', Horas_Semana: 40 },
      { Nombre_Horario: 'MEDIO_TIEMPO', Descripcion: 'Medio tiempo', Horas_Semana: 20 },
      { Nombre_Horario: 'HORAS', Descripcion: 'Por horas', Horas_Semana: null },
      { Nombre_Horario: 'MIXTO', Descripcion: 'Horario mixto', Horas_Semana: 48 }
    ],
    skipDuplicates: true
  });
  console.log('✅ Tipos de horario creados');

  // ============================================================
  // 4. CREAR ÁREAS
  // ============================================================
  await prisma.cat_Areas.createMany({
    data: [
      { Nombre_Area: 'LABORATORIO', Descripcion: 'Área de laboratorio', Tipo_Area: 'PRODUCCION' },
      { Nombre_Area: 'SISTEMAS', Descripcion: 'Tecnologías de información', Tipo_Area: 'SISTEMAS' },
      { Nombre_Area: 'COSMETICA', Descripcion: 'Producción cosmética', Tipo_Area: 'PRODUCCION' },
      { Nombre_Area: 'ADMINISTRACIÓN', Descripcion: 'Área administrativa', Tipo_Area: 'ADMINISTRATIVO' },
      { Nombre_Area: 'RECURSOS HUMANOS', Descripcion: 'Gestión de personal', Tipo_Area: 'ADMINISTRATIVO' },
      { Nombre_Area: 'CALIDAD', Descripcion: 'Control de calidad', Tipo_Area: 'PRODUCCION' },
      { Nombre_Area: 'ALMACÉN', Descripcion: 'Almacén y logística', Tipo_Area: 'OPERACIONES' },
      { Nombre_Area: 'VENTAS', Descripcion: 'Área comercial', Tipo_Area: 'COMERCIAL' }
    ],
    skipDuplicates: true
  });
  console.log('✅ Áreas creadas');

  // ============================================================
  // 5. CREAR NACIONALIDADES
  // ============================================================
  await prisma.cat_Nacionalidades.createMany({
    data: [
      { Nombre_Nacionalidad: 'MEXICANA', Codigo_ISO2: 'MX', Codigo_ISO3: 'MEX' },
      { Nombre_Nacionalidad: 'VENEZOLANA', Codigo_ISO2: 'VE', Codigo_ISO3: 'VEN' },
      { Nombre_Nacionalidad: 'COLOMBIANA', Codigo_ISO2: 'CO', Codigo_ISO3: 'COL' },
      { Nombre_Nacionalidad: 'ARGENTINA', Codigo_ISO2: 'AR', Codigo_ISO3: 'ARG' },
      { Nombre_Nacionalidad: 'ESTADOUNIDENSE', Codigo_ISO2: 'US', Codigo_ISO3: 'USA' },
      { Nombre_Nacionalidad: 'ESPAÑOLA', Codigo_ISO2: 'ES', Codigo_ISO3: 'ESP' },
      { Nombre_Nacionalidad: 'PERUANA', Codigo_ISO2: 'PE', Codigo_ISO3: 'PER' },
      { Nombre_Nacionalidad: 'CHILENA', Codigo_ISO2: 'CL', Codigo_ISO3: 'CHL' }
    ],
    skipDuplicates: true
  });
  console.log('✅ Nacionalidades creadas');

  // ============================================================
  // 6. CREAR PUESTOS
  // ============================================================
  // Primero obtenemos las áreas para relacionarlas
  const areaSistemas = await prisma.cat_Areas.findUnique({
    where: { Nombre_Area: 'SISTEMAS' }
  });
  
  const areaRH = await prisma.cat_Areas.findUnique({
    where: { Nombre_Area: 'RECURSOS HUMANOS' }
  });
  
  const areaCosmetica = await prisma.cat_Areas.findUnique({
    where: { Nombre_Area: 'COSMETICA' }
  });
  
  const areaAdmin = await prisma.cat_Areas.findUnique({
    where: { Nombre_Area: 'ADMINISTRACIÓN' }
  });

  if (areaSistemas && areaRH && areaCosmetica && areaAdmin) {
    await prisma.cat_Puestos.createMany({
      data: [
        {
          Nombre_Puesto: 'Técnico Sistemas',
          ID_Area: areaSistemas.ID_Area,
          Descripcion: 'Soporte técnico y mantenimiento',
          Salario_Base_Referencia: 12000,
          Salario_Hora_Referencia: 150
        },
        {
          Nombre_Puesto: 'Desarrollador Software',
          ID_Area: areaSistemas.ID_Area,
          Descripcion: 'Desarrollo de aplicaciones',
          Salario_Base_Referencia: 25000,
          Salario_Hora_Referencia: 300
        },
        {
          Nombre_Puesto: 'Coordinador RH',
          ID_Area: areaRH.ID_Area,
          Descripcion: 'Coordinación de recursos humanos',
          Salario_Base_Referencia: 18000,
          Salario_Hora_Referencia: 220
        },
        {
          Nombre_Puesto: 'Auxiliar RH',
          ID_Area: areaRH.ID_Area,
          Descripcion: 'Apoyo en gestión de personal',
          Salario_Base_Referencia: 10000,
          Salario_Hora_Referencia: 120
        },
        {
          Nombre_Puesto: 'Operador Cosmética',
          ID_Area: areaCosmetica.ID_Area,
          Descripcion: 'Operador de línea de producción',
          Salario_Base_Referencia: 8000,
          Salario_Hora_Referencia: 100
        },
        {
          Nombre_Puesto: 'Supervisor Producción',
          ID_Area: areaCosmetica.ID_Area,
          Descripcion: 'Supervisión de líneas de producción',
          Salario_Base_Referencia: 15000,
          Salario_Hora_Referencia: 180
        },
        {
          Nombre_Puesto: 'Contador General',
          ID_Area: areaAdmin.ID_Area,
          Descripcion: 'Contabilidad general',
          Salario_Base_Referencia: 20000,
          Salario_Hora_Referencia: 250
        },
        {
          Nombre_Puesto: 'Auxiliar Administrativo',
          ID_Area: areaAdmin.ID_Area,
          Descripcion: 'Apoyo administrativo',
          Salario_Base_Referencia: 9000,
          Salario_Hora_Referencia: 110
        }
      ],
      skipDuplicates: true
    });
    console.log('✅ Puestos creados');
  }

  // ============================================================
  // 7. CREAR USUARIO SUPER ADMIN
  // ============================================================
  const superAdminRole = await prisma.cat_Roles.findUnique({
    where: { Nombre_Rol: 'SUPER_ADMIN' }
  });

  if (superAdminRole) {
    const hashedPassword = await bcrypt.hash('password123', 10);

    await prisma.app_Usuarios.upsert({
      where: { Email_Office365: 'agomezj2101@alumno.ipn.mx' },
      update: {},
      create: {
        Email_Office365: 'agomezj2101@alumno.ipn.mx',
        Nombre_Completo: 'Super Administrador',
        ID_Rol: superAdminRole.ID_Rol,
        Password: hashedPassword,
        Activo: true
      }
    });
    console.log('✅ Usuario Super Admin creado');
  }

  console.log('');
  console.log('✅✅✅ Seed completado exitosamente ✅✅✅');
  console.log('');
  console.log('📧 Usuario: agomezj2101@alumno.ipn.mx');
  console.log('🔐 Password: password123');
  console.log('');
}

main()
  .catch(e => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
