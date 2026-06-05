/**
 * export-steren.js
 * Exporta empleados activos de VITA a un archivo Excel (steren_import.xlsx)
 * con el formato de columnas de la plantilla Steren.
 *
 * Uso:
 *   node scripts/export-steren.js
 *
 * Salida:
 *   steren_import.xlsx (en el directorio de ejecución)
 *
 * Prerequisitos:
 *   - npm install xlsx (ya incluido en dependencias)
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

// Columnas de la plantilla Steren, en orden exacto.
// Las no mapeadas se exportan vacías.
const COLUMNS = [
  'ID del Empleado',
  'Nombre',
  'Apellido',
  'Código departamento',
  'Nombre del departamento',
  'Código de cargo',
  'Nombre del cargo',
  'Fecha de contratación',
  'Número de Tarjeta',
  'Código de área',
  'Género',
  'Celular',
  'Cumpleaños',
  'Corre electrónico',
];

/** Formatea Date a YYYY-MM-DD; null/undefined → cadena vacía. */
const fmtDate = (d) => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return '';
  return date.toISOString().slice(0, 10);
};

async function main() {
  console.log('Consultando empleados activos...');

  const empleados = await prisma.empleados.findMany({
    where: { estatus: { Nombre_Estatus: 'ACTIVO' } },
    include: {
      area: true,
      puesto: true,
    },
    orderBy: { ID_Empleado: 'asc' },
  });

  console.log(`Empleados activos: ${empleados.length}`);

  // Construir filas como objetos con claves = nombres de columna de la plantilla.
  const rows = empleados.map((e) => ({
    'ID del Empleado': e.ID_Empleado,
    'Nombre': e.Nombre.toUpperCase(),
    'Apellido': (e.Apellido_Materno
      ? `${e.Apellido_Paterno} ${e.Apellido_Materno}`
      : e.Apellido_Paterno).toUpperCase(),
    'Código departamento': e.ID_Area,
    'Nombre del departamento': e.area?.Nombre_Area ?? '',
    'Código de cargo': e.ID_Puesto,
    'Nombre del cargo': e.puesto?.Nombre_Puesto ?? '',
    'Fecha de contratación': fmtDate(e.Fecha_Ingreso),
    // Resto de columnas vacías
    'Número de Tarjeta': '',
    'Código de área': '',
    'Género': '',
    'Celular': '',
    'Cumpleaños': '',
    'Corre electrónico': '',
  }));

  // Generar hoja respetando el orden exacto de columnas (header explícito).
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });

  // Asegurar encabezados aun cuando no haya filas.
  if (rows.length === 0) {
    XLSX.utils.sheet_add_aoa(worksheet, [COLUMNS], { origin: 'A1' });
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Empleados');

  const outPath = resolve(process.cwd(), 'steren_import.xlsx');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  writeFileSync(outPath, buffer);

  console.log(`Archivo generado: ${outPath}`);
}

main()
  .catch((err) => {
    console.error('Error fatal:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
