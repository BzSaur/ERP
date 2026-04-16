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
      // Áreas administrativas y generales
      { Nombre_Area: 'LABORATORIO', Descripcion: 'Área de laboratorio general', Tipo_Area: 'PRODUCCION' },
      { Nombre_Area: 'SISTEMAS', Descripcion: 'Tecnologías de información', Tipo_Area: 'SISTEMAS' },
      { Nombre_Area: 'COSMETICA', Descripcion: 'Lijado y liberación de componentes', Tipo_Area: 'PRODUCCION' },
      { Nombre_Area: 'ADMINISTRACIÓN', Descripcion: 'Área administrativa', Tipo_Area: 'ADMINISTRATIVO' },
      { Nombre_Area: 'RECURSOS HUMANOS', Descripcion: 'Gestión de personal', Tipo_Area: 'ADMINISTRATIVO' },
      { Nombre_Area: 'CALIDAD', Descripcion: 'Control de calidad', Tipo_Area: 'PRODUCCION' },
      { Nombre_Area: 'ALMACÉN', Descripcion: 'Almacén y logística', Tipo_Area: 'OPERACIONES' },
      { Nombre_Area: 'VENTAS', Descripcion: 'Área comercial', Tipo_Area: 'COMERCIAL' },
      // Áreas de producción MERO
      { Nombre_Area: 'LABORATORIO - TEST INICIAL', Descripcion: 'Pruebas iniciales y desensamble', Tipo_Area: 'PRODUCCION' },
      { Nombre_Area: 'LABORATORIO - REPARACIÓN', Descripcion: 'Reparación de equipos por nivel', Tipo_Area: 'PRODUCCION' },
      { Nombre_Area: 'LAVADO', Descripcion: 'Lavado de componentes', Tipo_Area: 'PRODUCCION' },
      { Nombre_Area: 'LABORATORIO - RETEST', Descripcion: 'Verificación post-reparación', Tipo_Area: 'PRODUCCION' },
      { Nombre_Area: 'EMPAQUE', Descripcion: 'Ensamble, etiquetado y empaquetado final', Tipo_Area: 'PRODUCCION' },
      { Nombre_Area: 'PINTURA', Descripcion: 'Pintura de componentes', Tipo_Area: 'PRODUCCION' },
      { Nombre_Area: 'SERIGRAFÍA', Descripcion: 'Serigrafía de componentes', Tipo_Area: 'PRODUCCION' }
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
  // 6. CREAR PUESTOS (12 puestos MERO)
  // Nombres exactos usados en el CSV. Salario homogéneo 9,451.20 / 315.04 diario.
  // ============================================================
  const areas = await prisma.cat_Areas.findMany();
  const areaMap = Object.fromEntries(areas.map((a) => [a.Nombre_Area, a.ID_Area]));

  const S = 9451.20;   // Salario_Mensual de referencia
  const H = 315.04;    // Salario_Diario de referencia (usado como Salario_Hora_Referencia)

  await prisma.cat_Puestos.createMany({
    data: [
      { Nombre_Puesto: 'Empleado Test Inicial',  ID_Area: areaMap['Laboratorio - Test Inicial'], Descripcion: 'Pruebas iniciales y desensamble',    Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
      { Nombre_Puesto: 'Empleado Reparación',    ID_Area: areaMap['Laboratorio - Reparación'],   Descripcion: 'Reparación de equipos por nivel',   Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
      { Nombre_Puesto: 'Empleado Lavado',         ID_Area: areaMap['Lavado'],                     Descripcion: 'Lavado de componentes',             Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
      { Nombre_Puesto: 'Empleado Retest',         ID_Area: areaMap['Laboratorio - Retest'],       Descripcion: 'Verificación post-reparación',      Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
      { Nombre_Puesto: 'Empleado Empaque',        ID_Area: areaMap['Empaque'],                    Descripcion: 'Ensamble, etiquetado y empaque',    Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
      { Nombre_Puesto: 'Empleado Cosmética',      ID_Area: areaMap['Cosmética'],                  Descripcion: 'Lijado y liberación de componentes',Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
      { Nombre_Puesto: 'Empleado Pintura',        ID_Area: areaMap['Pintura'],                    Descripcion: 'Pintura de componentes',            Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
      { Nombre_Puesto: 'Empleado Serigrafía',     ID_Area: areaMap['Serigrafía'],                 Descripcion: 'Serigrafía de componentes',         Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
      { Nombre_Puesto: 'Empleado IT',             ID_Area: areaMap['IT Sistemas'],                Descripcion: 'Soporte y desarrollo de sistemas',  Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
      { Nombre_Puesto: 'Empleado RH',             ID_Area: areaMap['Recursos Humanos'],           Descripcion: 'Gestión de recursos humanos',       Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
      { Nombre_Puesto: 'Empleado Mantenimiento',  ID_Area: areaMap['Mantenimiento'],              Descripcion: 'Mantenimiento de equipos',          Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
      { Nombre_Puesto: 'Empleado Almacén',        ID_Area: areaMap['Almacén'],                    Descripcion: 'Control de inventario y almacén',   Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
    ],
  });
  console.log('✅ Puestos creados');

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
