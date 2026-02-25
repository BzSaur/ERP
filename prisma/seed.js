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
  // 6. CREAR PUESTOS
  // ============================================================
  // Obtenemos todas las áreas para relacionar puestos
  const areas = await prisma.cat_Areas.findMany();
  const areaMap = {};
  areas.forEach(a => { areaMap[a.Nombre_Area] = a.ID_Area; });

  // Sueldo homogéneo $8,364 para todos excepto encargados/supervisores
  const S = 8364, H = 35;

  const puestosData = [
    // Administrativos y generales — mismo sueldo base
    { Nombre_Puesto: 'Técnico Sistemas', ID_Area: areaMap['SISTEMAS'], Descripcion: 'Soporte técnico y mantenimiento', Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
    { Nombre_Puesto: 'Desarrollador Software', ID_Area: areaMap['SISTEMAS'], Descripcion: 'Desarrollo de aplicaciones', Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
    { Nombre_Puesto: 'Coordinador RH', ID_Area: areaMap['RECURSOS HUMANOS'], Descripcion: 'Coordinación de recursos humanos (encargado)', Salario_Base_Referencia: 15215, Salario_Hora_Referencia: 63 },
    { Nombre_Puesto: 'Auxiliar RH', ID_Area: areaMap['RECURSOS HUMANOS'], Descripcion: 'Apoyo en gestión de personal', Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
    { Nombre_Puesto: 'Contador General', ID_Area: areaMap['ADMINISTRACIÓN'], Descripcion: 'Contabilidad general', Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
    { Nombre_Puesto: 'Auxiliar Administrativo', ID_Area: areaMap['ADMINISTRACIÓN'], Descripcion: 'Apoyo administrativo', Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
    { Nombre_Puesto: 'Supervisor Producción', ID_Area: areaMap['COSMETICA'], Descripcion: 'Supervisión de líneas de producción (encargado)', Salario_Base_Referencia: 13927, Salario_Hora_Referencia: 58 },
    { Nombre_Puesto: 'Ejecutivo Ventas', ID_Area: areaMap['VENTAS'], Descripcion: 'Ventas y relación con clientes', Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
    { Nombre_Puesto: 'Almacenista', ID_Area: areaMap['ALMACÉN'], Descripcion: 'Control de inventario y almacén', Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
    { Nombre_Puesto: 'Inspector Calidad', ID_Area: areaMap['CALIDAD'], Descripcion: 'Inspección y control de calidad', Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
    // Puestos de producción MERO
    { Nombre_Puesto: 'Operador Test Inicial', ID_Area: areaMap['LABORATORIO - TEST INICIAL'], Descripcion: 'Pruebas iniciales y desensamble', Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
    { Nombre_Puesto: 'Operador Reparación', ID_Area: areaMap['LABORATORIO - REPARACIÓN'], Descripcion: 'Reparación de equipos por nivel', Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
    { Nombre_Puesto: 'Operador Lavado', ID_Area: areaMap['LAVADO'], Descripcion: 'Lavado de componentes', Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
    { Nombre_Puesto: 'Operador Retest', ID_Area: areaMap['LABORATORIO - RETEST'], Descripcion: 'Verificación post-reparación', Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
    { Nombre_Puesto: 'Operador Empaque', ID_Area: areaMap['EMPAQUE'], Descripcion: 'Ensamble, etiquetado y empaquetado', Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
    { Nombre_Puesto: 'Operador Cosmética', ID_Area: areaMap['COSMETICA'], Descripcion: 'Lijado y liberación de componentes', Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
    { Nombre_Puesto: 'Operador Pintura', ID_Area: areaMap['PINTURA'], Descripcion: 'Pintura de componentes', Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
    { Nombre_Puesto: 'Operador Serigrafía', ID_Area: areaMap['SERIGRAFÍA'], Descripcion: 'Serigrafía de componentes', Salario_Base_Referencia: S, Salario_Hora_Referencia: H },
  ].filter(p => p.ID_Area);

  if (puestosData.length) {
    await prisma.cat_Puestos.createMany({
      data: puestosData,
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
