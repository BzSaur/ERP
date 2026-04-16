/**
 * Script de un solo uso: crea el área Mantenimiento y su puesto en la DB.
 * Ejecutar una vez y luego borrar.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const area = await prisma.cat_Areas.upsert({
  where:  { Nombre_Area: 'Mantenimiento' },
  update: {},
  create: {
    Nombre_Area: 'Mantenimiento',
    Descripcion: 'Mantenimiento de equipos e instalaciones',
    Tipo_Area:   'OPERACIONES',
  },
});

await prisma.cat_Puestos.upsert({
  where:  { Nombre_Puesto: 'Empleado Mantenimiento' },
  update: {},
  create: {
    Nombre_Puesto:           'Empleado Mantenimiento',
    ID_Area:                 area.ID_Area,
    Descripcion:             'Mantenimiento de equipos',
    Salario_Base_Referencia: 9451.20,
    Salario_Hora_Referencia: 315.04,
  },
});

console.log(`Area ID ${area.ID_Area} y puesto creados.`);
await prisma.$disconnect();
