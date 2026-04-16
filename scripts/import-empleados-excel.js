import { PrismaClient } from '@prisma/client';
import XLSX from 'xlsx';
import path from 'path';

const prisma = new PrismaClient();

const REQUIRED_FIELDS = [
  'Nombre',
  'Apellido_Paterno',
  'Tipo_Documento',
  'Documento_Identidad',
  'Nacionalidad',
  'Area',
  'Puesto',
  'Fecha_Ingreso',
  'Tipo_Horario'
];

const HEADER_ALIASES = {
  Nombre: [
    'ingrese el nombre del empleado',
    'nombre del empleado',
    'nombre',
    'nombres'
  ],
  Apellido_Paterno: [
    'ingrese el apellido paterno',
    'apellido paterno',
    'ap paterno'
  ],
  Apellido_Materno: [
    'ingrese el apellido materno',
    'apellido materno',
    'ap materno'
  ],
  Fecha_Nacimiento: [
    'ingrese la fecha de nacimiento',
    'fecha de nacimiento',
    'nacimiento'
  ],
  Tipo_Documento: [
    'tipo de documento',
    'tipo documento'
  ],
  Documento_Identidad: [
    'numero de documento',
    'nmero de documento',
    'documento identidad',
    'documento de identidad'
  ],
  Nacionalidad: [
    'seleccione la nacionalidad',
    'nacionalidad'
  ],
  RFC: ['rfc'],
  NSS: [
    'nss',
    'numero de seguridad social',
    'numero seguro social'
  ],
  Area: [
    'area',
    'rea'
  ],
  Puesto: ['puesto'],
  Fecha_Ingreso: [
    'fecha de ingreso',
    'ingreso'
  ],
  Tipo_Horario: [
    'tipo de horario',
    'horario'
  ],
  Email_Personal: [
    'email personal',
    'correo personal'
  ],
  Email_Corporativo: [
    'email corporativo',
    'correo corporativo'
  ],
  Telefono_Celular: [
    'telefono celular',
    'telfono celular',
    'celular'
  ],
  Telefono_Emergencia: [
    'telefono de emergencia',
    'telfono de emergencia'
  ],
  Nombre_Emergencia: [
    'nombre de contacto de emergencia',
    'nombre emergencia'
  ],
  Parentesco_Emergencia: [
    'parentesco del contacto de emergencia',
    'parentesco'
  ],
  Calle: ['calle'],
  Numero_Exterior: ['numero exterior', 'nmero exterior'],
  Numero_Interior: ['numero interior', 'nmero interior'],
  Colonia: ['colonia'],
  Ciudad: ['ciudad'],
  Entidad_Federativa: ['estado', 'entidad federativa'],
  Codigo_Postal: ['codigo postal', 'cdigo postal', 'cp']
};

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function toNullableString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function parseExcelDate(value) {
  if (!value && value !== 0) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(parsed.y, parsed.m - 1, parsed.d);
    }
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;

    const iso = /^\d{4}-\d{1,2}-\d{1,2}$/;
    if (iso.test(text)) {
      return new Date(`${text}T00:00:00`);
    }

    const sep = text.includes('/') ? '/' : text.includes('-') ? '-' : null;
    if (sep) {
      const parts = text.split(sep).map((x) => x.trim());
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          const [y, m, d] = parts.map(Number);
          return new Date(y, m - 1, d);
        }
        const [d, m, y] = parts.map(Number);
        return new Date(y, m - 1, d);
      }
    }

    const fallback = new Date(text);
    if (!Number.isNaN(fallback.getTime())) {
      return fallback;
    }
  }

  return null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    file: null,
    sheet: null,
    dryRun: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--file' && args[i + 1]) {
      options.file = args[i + 1];
      i += 1;
    } else if (arg === '--sheet' && args[i + 1]) {
      options.sheet = args[i + 1];
      i += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

function buildColumnMap(headers) {
  const normalizedHeaders = headers.map((h) => normalizeText(h));
  const map = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    let foundIndex = -1;

    for (let i = 0; i < normalizedHeaders.length; i += 1) {
      const header = normalizedHeaders[i];
      const matched = aliases.some((alias) => header.includes(normalizeText(alias)));
      if (matched) {
        foundIndex = i;
        break;
      }
    }

    map[field] = foundIndex;
  }

  return map;
}

function rowValue(row, columnMap, field) {
  const index = columnMap[field];
  if (index === undefined || index < 0 || index >= row.length) return null;
  return row[index];
}

function extractOtherLabel(rawValue) {
  const text = String(rawValue ?? '').trim();
  if (!text) return null;

  const upper = normalizeText(text);
  if (!upper.startsWith('OTRO')) {
    return text;
  }

  const separatorIndex = text.search(/[:\-]/);
  if (separatorIndex === -1) {
    return null;
  }

  const detail = text.slice(separatorIndex + 1).trim();
  return detail || null;
}

function salaryNumbers(monthly) {
  if (!monthly || Number.isNaN(monthly)) {
    return {
      mensual: null,
      diario: null,
      hora: null
    };
  }

  const diario = monthly / 30;
  const hora = diario / 8;

  return {
    mensual: Number(monthly.toFixed(2)),
    diario: Number(diario.toFixed(2)),
    hora: Number(hora.toFixed(2))
  };
}

async function getCatalogMaps() {
  const [areas, puestos, nacionalidades, horarios, estatuses] = await Promise.all([
    prisma.cat_Areas.findMany(),
    prisma.cat_Puestos.findMany(),
    prisma.cat_Nacionalidades.findMany(),
    prisma.cat_Tipo_Horario.findMany(),
    prisma.cat_Estatus_Empleado.findMany()
  ]);

  const areaByName = new Map();
  areas.forEach((area) => areaByName.set(normalizeText(area.Nombre_Area), area));

  const puestoByName = new Map();
  puestos.forEach((puesto) => puestoByName.set(normalizeText(puesto.Nombre_Puesto), puesto));

  const nacionalidadByName = new Map();
  nacionalidades.forEach((n) => nacionalidadByName.set(normalizeText(n.Nombre_Nacionalidad), n));

  const horarioByName = new Map();
  horarios.forEach((h) => horarioByName.set(normalizeText(h.Nombre_Horario), h));

  const estatusActivo =
    estatuses.find((e) => normalizeText(e.Nombre_Estatus) === 'ACTIVO') ||
    estatuses[0] ||
    null;

  return {
    areaByName,
    puestoByName,
    nacionalidadByName,
    horarioByName,
    estatusActivo
  };
}

async function resolveArea(rawArea, maps) {
  const extracted = extractOtherLabel(rawArea);
  if (!extracted) {
    throw new Error('Area vacia o invalida');
  }

  const key = normalizeText(extracted);
  const existing = maps.areaByName.get(key);
  if (existing) return existing;

  const created = await prisma.cat_Areas.create({
    data: {
      Nombre_Area: extracted.toUpperCase(),
      Descripcion: 'Creada automaticamente desde importacion Excel',
      Tipo_Area: 'OTRO'
    }
  });

  maps.areaByName.set(key, created);
  return created;
}

async function resolvePuesto(rawPuesto, area, maps) {
  const extracted = extractOtherLabel(rawPuesto);
  if (!extracted) {
    throw new Error('Puesto vacio o invalido');
  }

  const key = normalizeText(extracted);
  const existing = maps.puestoByName.get(key);
  if (existing) {
    if (existing.ID_Area !== area.ID_Area) {
      throw new Error(
        `El puesto "${existing.Nombre_Puesto}" pertenece al area ID ${existing.ID_Area}, no al area seleccionada ID ${area.ID_Area}`
      );
    }
    return existing;
  }

  const created = await prisma.cat_Puestos.create({
    data: {
      Nombre_Puesto: extracted.toUpperCase(),
      ID_Area: area.ID_Area,
      Descripcion: 'Creado automaticamente desde importacion Excel',
      Salario_Base_Referencia: null,
      Salario_Hora_Referencia: null
    }
  });

  maps.puestoByName.set(key, created);
  return created;
}

function resolveNacionalidad(rawNacionalidad, maps) {
  const text = toNullableString(rawNacionalidad);
  if (!text) {
    throw new Error('Nacionalidad vacia');
  }

  const found = maps.nacionalidadByName.get(normalizeText(text));
  if (!found) {
    throw new Error(`Nacionalidad no encontrada: "${text}"`);
  }

  return found;
}

function resolveHorario(rawHorario, maps) {
  const text = toNullableString(rawHorario);
  if (!text) {
    throw new Error('Tipo de horario vacio');
  }

  const found = maps.horarioByName.get(normalizeText(text));
  if (!found) {
    throw new Error(`Tipo de horario no encontrado: "${text}"`);
  }

  return found;
}

function validateRequired(rowObj, rowNumber) {
  for (const field of REQUIRED_FIELDS) {
    if (!toNullableString(rowObj[field])) {
      throw new Error(`Fila ${rowNumber}: falta campo requerido ${field}`);
    }
  }
}

async function importRows(rows, columnMap, options) {
  const maps = await getCatalogMaps();

  if (!maps.estatusActivo) {
    throw new Error('No hay estatus disponibles en Cat_Estatus_Empleado');
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNumber = i + 2;

    const rowObj = {
      Nombre: rowValue(row, columnMap, 'Nombre'),
      Apellido_Paterno: rowValue(row, columnMap, 'Apellido_Paterno'),
      Apellido_Materno: rowValue(row, columnMap, 'Apellido_Materno'),
      Fecha_Nacimiento: rowValue(row, columnMap, 'Fecha_Nacimiento'),
      Tipo_Documento: rowValue(row, columnMap, 'Tipo_Documento'),
      Documento_Identidad: rowValue(row, columnMap, 'Documento_Identidad'),
      Nacionalidad: rowValue(row, columnMap, 'Nacionalidad'),
      RFC: rowValue(row, columnMap, 'RFC'),
      NSS: rowValue(row, columnMap, 'NSS'),
      Area: rowValue(row, columnMap, 'Area'),
      Puesto: rowValue(row, columnMap, 'Puesto'),
      Fecha_Ingreso: rowValue(row, columnMap, 'Fecha_Ingreso'),
      Tipo_Horario: rowValue(row, columnMap, 'Tipo_Horario'),
      Email_Personal: rowValue(row, columnMap, 'Email_Personal'),
      Email_Corporativo: rowValue(row, columnMap, 'Email_Corporativo'),
      Telefono_Celular: rowValue(row, columnMap, 'Telefono_Celular'),
      Telefono_Emergencia: rowValue(row, columnMap, 'Telefono_Emergencia'),
      Nombre_Emergencia: rowValue(row, columnMap, 'Nombre_Emergencia'),
      Parentesco_Emergencia: rowValue(row, columnMap, 'Parentesco_Emergencia'),
      Calle: rowValue(row, columnMap, 'Calle'),
      Numero_Exterior: rowValue(row, columnMap, 'Numero_Exterior'),
      Numero_Interior: rowValue(row, columnMap, 'Numero_Interior'),
      Colonia: rowValue(row, columnMap, 'Colonia'),
      Ciudad: rowValue(row, columnMap, 'Ciudad'),
      Entidad_Federativa: rowValue(row, columnMap, 'Entidad_Federativa'),
      Codigo_Postal: rowValue(row, columnMap, 'Codigo_Postal')
    };

    const documento = toNullableString(rowObj.Documento_Identidad);
    if (!documento) {
      skipped += 1;
      continue;
    }

    try {
      validateRequired(rowObj, rowNumber);

      const fechaIngreso = parseExcelDate(rowObj.Fecha_Ingreso);
      if (!fechaIngreso) {
        throw new Error(`Fila ${rowNumber}: Fecha_Ingreso invalida`);
      }

      const fechaNacimiento = parseExcelDate(rowObj.Fecha_Nacimiento);
      const area = await resolveArea(rowObj.Area, maps);
      const puesto = await resolvePuesto(rowObj.Puesto, area, maps);
      const nacionalidad = resolveNacionalidad(rowObj.Nacionalidad, maps);
      const horario = resolveHorario(rowObj.Tipo_Horario, maps);

      const salarioBase = puesto.Salario_Base_Referencia
        ? Number(puesto.Salario_Base_Referencia)
        : null;
      const salarios = salaryNumbers(salarioBase);

      const data = {
        Nombre: toNullableString(rowObj.Nombre),
        Apellido_Paterno: toNullableString(rowObj.Apellido_Paterno),
        Apellido_Materno: toNullableString(rowObj.Apellido_Materno),
        Fecha_Nacimiento: fechaNacimiento,
        ID_Nacionalidad: nacionalidad.ID_Nacionalidad,
        Documento_Identidad: documento,
        Tipo_Documento: toNullableString(rowObj.Tipo_Documento),
        RFC: toNullableString(rowObj.RFC),
        NSS: toNullableString(rowObj.NSS),
        Email_Personal: toNullableString(rowObj.Email_Personal),
        Email_Corporativo: toNullableString(rowObj.Email_Corporativo),
        Telefono_Celular: toNullableString(rowObj.Telefono_Celular),
        Telefono_Emergencia: toNullableString(rowObj.Telefono_Emergencia),
        Nombre_Emergencia: toNullableString(rowObj.Nombre_Emergencia),
        Parentesco_Emergencia: toNullableString(rowObj.Parentesco_Emergencia),
        Calle: toNullableString(rowObj.Calle),
        Numero_Exterior: toNullableString(rowObj.Numero_Exterior),
        Numero_Interior: toNullableString(rowObj.Numero_Interior),
        Colonia: toNullableString(rowObj.Colonia),
        Ciudad: toNullableString(rowObj.Ciudad),
        Entidad_Federativa: toNullableString(rowObj.Entidad_Federativa),
        Codigo_Postal: toNullableString(rowObj.Codigo_Postal),
        ID_Puesto: puesto.ID_Puesto,
        ID_Area: area.ID_Area,
        ID_Tipo_Horario: horario.ID_Tipo_Horario,
        Salario_Mensual: salarios.mensual,
        Salario_Diario: salarios.diario,
        Salario_Hora: salarios.hora,
        Horas_Semanales_Contratadas: horario.Horas_Semana || 48,
        ID_Estatus: maps.estatusActivo.ID_Estatus,
        Fecha_Ingreso: fechaIngreso,
        UpdatedBy: 'IMPORT_EXCEL'
      };

      const existing = options.dryRun
        ? null
        : await prisma.empleados.findUnique({ where: { Documento_Identidad: documento } });

      if (!options.dryRun) {
        await prisma.empleados.upsert({
          where: { Documento_Identidad: documento },
          create: {
            ...data,
            CreatedBy: 'IMPORT_EXCEL'
          },
          update: {
            ...data
          }
        });
      }

      if (existing) {
        updated += 1;
      } else {
        created += 1;
      }
    } catch (error) {
      errors.push(`Fila ${rowNumber} (${documento}): ${error.message}`);
    }
  }

  return {
    created,
    updated,
    skipped,
    errors
  };
}

async function main() {
  const options = parseArgs();

  if (!options.file) {
    console.error('Uso: node scripts/import-empleados-excel.js --file "./ruta/empleados.xlsx" [--sheet "Hoja1"] [--dry-run]');
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), options.file);
  const workbook = XLSX.readFile(filePath, {
    cellDates: true,
    raw: false
  });

  const sheetName = options.sheet || workbook.SheetNames[0];
  if (!sheetName || !workbook.Sheets[sheetName]) {
    console.error('No se encontro la hoja solicitada en el archivo Excel.');
    process.exit(1);
  }

  const rowsMatrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: ''
  });

  if (!rowsMatrix.length) {
    console.error('La hoja esta vacia.');
    process.exit(1);
  }

  const headers = rowsMatrix[0];
  const rows = rowsMatrix.slice(1);
  const columnMap = buildColumnMap(headers);

  const missingHeaderFields = REQUIRED_FIELDS.filter((field) => columnMap[field] === -1);
  if (missingHeaderFields.length) {
    console.error('Faltan columnas obligatorias en el Excel:', missingHeaderFields.join(', '));
    process.exit(1);
  }

  console.log('Iniciando importacion de empleados...');
  console.log(`Archivo: ${filePath}`);
  console.log(`Hoja: ${sheetName}`);
  console.log(`Modo: ${options.dryRun ? 'DRY RUN' : 'IMPORTACION REAL'}`);
  console.log(`Filas detectadas: ${rows.length}`);

  const result = await importRows(rows, columnMap, options);

  console.log('');
  console.log('Resultado de importacion');
  console.log(`Creados: ${result.created}`);
  console.log(`Actualizados: ${result.updated}`);
  console.log(`Saltados sin documento: ${result.skipped}`);
  console.log(`Errores: ${result.errors.length}`);

  if (result.errors.length) {
    console.log('');
    console.log('Detalle de errores:');
    result.errors.forEach((err) => console.log(`- ${err}`));
  }
}

main()
  .catch((error) => {
    console.error('Error en importacion:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
