/**
 * import-employees.js
 * Importa empleados desde un CSV depurado a la base de datos de VITA.
 *
 * Uso:
 *   node scripts/import-employees.js --file=empleados.csv
 *   node scripts/import-employees.js --file empleados.csv
 *
 * Prerequisitos:
 *   - Catálogos poblados (seed:all)
 *   - npm install csv-parse
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Retorna el string limpio o null si está vacío. */
const str = (v) => (v && String(v).trim() !== '' ? String(v).trim() : null);

/**
 * Trunca a max caracteres y retorna null si vacío.
 * Evita el error "value too long for type character varying(N)".
 */
const cap = (v, max) => {
  const s = str(v);
  return s ? s.slice(0, max) : null;
};

/**
 * Parsea una fecha con tolerancia a varios formatos comunes:
 *   YYYY-MM-DD · DD/MM/YYYY · DD-MM-YYYY · MM/DD/YYYY
 * Retorna null si el valor está vacío o no es parseable.
 */
const toDate = (v) => {
  const s = str(v);
  if (!s) return null;

  // Formato ISO: YYYY-MM-DD o YYYY/MM/DD
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}T00:00:00`);
    return isNaN(d) ? null : d;
  }

  // Formato latino: DD/MM/YYYY o DD-MM-YYYY
  const lat = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (lat) {
    const d = new Date(`${lat[3]}-${lat[2].padStart(2,'0')}-${lat[1].padStart(2,'0')}T00:00:00`);
    return isNaN(d) ? null : d;
  }

  // Último recurso: dejar que JS lo intente
  const fallback = new Date(s);
  return isNaN(fallback) ? null : fallback;
};

/**
 * Cuando la celda tiene varios valores separados por coma ("Mexicana, Estadounidense"),
 * toma solo el primero.
 */
const firstVal = (v) => str(String(v ?? '').split(',')[0]);

/**
 * Normaliza un nombre de catálogo para comparación tolerante:
 * strip acentos → uppercase → colapsa espacios.
 * "Cosmética" y "COSMETICA" resuelven al mismo key.
 */
const norm = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

// ── Alias CSV → DB ────────────────────────────────────────────────────────────
// Mapea valores del CSV (normalizados) a claves normalizadas de la DB cuando
// los nombres son estructuralmente distintos y la normalización sola no alcanza.
// Clave: norm(valor CSV)  →  Valor: norm(Nombre en DB).

const HORARIO_ALIASES = {
  'TIEMPO COMPLETO':  'COMPLETO',
  'HIBRIDO / MIXTO':  'MIXTO',
  'MEDIO TIEMPO':     'MEDIO_TIEMPO',
  // 'HORAS' coincide exacto, no necesita alias
};

const AREA_ALIASES = {
  'IT SISTEMAS': 'SISTEMAS',
  // "Mantenimiento" no tiene equivalente en DB — se registrará como error
};

const PUESTO_ALIASES = {
  'EMPLEADO TEST INICIAL':  'OPERADOR TEST INICIAL',
  'EMPLEADO REPARACION':    'OPERADOR REPARACION',
  'EMPLEADO LAVADO':        'OPERADOR LAVADO',
  'EMPLEADO RETEST':        'OPERADOR RETEST',
  'EMPLEADO EMPAQUE':       'OPERADOR EMPAQUE',
  'EMPLEADO COSMETICA':     'OPERADOR COSMETICA',
  'EMPLEADO PINTURA':       'OPERADOR PINTURA',
  'EMPLEADO SERIGRAFIA':    'OPERADOR SERIGRAFIA',
  'EMPLEADO IT':            'TECNICO SISTEMAS',
  'EMPLEADO RH':            'AUXILIAR RH',
  'EMPLEADO MANTENIMIENTO': null,   // sin equivalente — se registrará como error
  'EMPLEADO ALMACEN':       'ALMACENISTA',
};

/**
 * Busca un ID en un Map con clave normalizada.
 * Primero intenta coincidencia exacta normalizada; si no, consulta la tabla de alias.
 */
function lookup(map, csvValue, aliases = {}) {
  const key = norm(csvValue);
  if (map.has(key)) return map.get(key);
  const aliasKey = aliases[key];
  if (aliasKey === null) return undefined;   // alias explícito a "no existe"
  if (aliasKey) return map.get(aliasKey);
  return undefined;
}

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let file = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--file=')) {
      file = arg.slice('--file='.length);
    } else if (arg === '--file' && args[i + 1]) {
      file = args[i + 1];
      i++;
    }
  }

  return { file };
}

// ── Catálogos ─────────────────────────────────────────────────────────────────

/**
 * Carga los mapas de catálogo al inicio.
 * Clave: nombre normalizado (sin acentos, uppercase) → valor: ID.
 * puestoSalaryMap: ID_Puesto → { mensual, diario } para derivar salario del puesto.
 */
async function loadCatalogMaps() {
  const [areas, puestos, horarios, nacionalidades] = await Promise.all([
    prisma.cat_Areas.findMany(),
    prisma.cat_Puestos.findMany(),
    prisma.cat_Tipo_Horario.findMany(),
    prisma.cat_Nacionalidades.findMany(),
  ]);

  const areaMap = new Map(areas.map((a) => [norm(a.Nombre_Area), a.ID_Area]));
  const puestoMap = new Map(puestos.map((p) => [norm(p.Nombre_Puesto), p.ID_Puesto]));
  const puestoSalaryMap = new Map(
    puestos.map((p) => [
      p.ID_Puesto,
      {
        mensual: Number(p.Salario_Base_Referencia) || 9451.20,
        diario:  Number(p.Salario_Hora_Referencia)  || 315.04,
      },
    ])
  );
  const horarioMap = new Map(horarios.map((h) => [norm(h.Nombre_Horario), h.ID_Tipo_Horario]));
  const nacionalidadMap = new Map(
    nacionalidades.map((n) => [norm(n.Nombre_Nacionalidad), n.ID_Nacionalidad])
  );

  return { areaMap, puestoMap, puestoSalaryMap, horarioMap, nacionalidadMap };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { file } = parseArgs();

  if (!file) {
    console.error('Uso: node scripts/import-employees.js --file=empleados.csv');
    process.exit(1);
  }

  const filePath = resolve(process.cwd(), file);
  console.log(`Archivo  : ${filePath}`);

  // 1. Sincronizar salario de referencia en todos los puestos
  await prisma.cat_Puestos.updateMany({
    data: { Salario_Base_Referencia: 9451.20, Salario_Hora_Referencia: 315.04 },
  });

  // 2. Cargar catálogos (puestoSalaryMap ya tendrá valores actualizados)
  console.log('Cargando catálogos...');
  const maps = await loadCatalogMaps();
  console.log(
    `  Areas: ${maps.areaMap.size} | Puestos: ${maps.puestoMap.size} | ` +
    `Horarios: ${maps.horarioMap.size} | Nacionalidades: ${maps.nacionalidadMap.size}`
  );
  if (process.argv.includes('--debug')) {
    console.log('  [debug] Areas en DB:', [...maps.areaMap.keys()].join(', '));
    console.log('  [debug] Puestos en DB:', [...maps.puestoMap.keys()].join(', '));
    console.log('  [debug] Horarios en DB:', [...maps.horarioMap.keys()].join(', '));
    console.log('  [debug] Nacionalidades en DB:', [...maps.nacionalidadMap.keys()].join(', '));
  }

  // 2. Parsear CSV
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`No se pudo leer el archivo: ${err.message}`);
    process.exit(1);
  }

  let records;
  try {
    records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,          // elimina BOM de UTF-8 si lo incluye Excel
    });
  } catch (err) {
    console.error(`Error al parsear el CSV: ${err.message}`);
    process.exit(1);
  }

  console.log(`Filas    : ${records.length}`);
  console.log('');

  // 3. Procesar fila por fila
  let inserted = 0;
  let updated = 0;
  let errCount = 0;
  const errorLog = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2; // fila 1 es el encabezado

    // ── Validaciones de campos requeridos ───────────────────────────────────
    if (!str(row.Nombre)) {
      errorLog.push({ fila: rowNum, motivo: 'Campo requerido vacío: Nombre' });
      errCount++;
      continue;
    }
    if (!str(row.Apellido_Paterno)) {
      errorLog.push({ fila: rowNum, motivo: 'Campo requerido vacío: Apellido_Paterno' });
      errCount++;
      continue;
    }
    if (!str(row.Fecha_Ingreso)) {
      errorLog.push({ fila: rowNum, motivo: 'Campo requerido vacío: Fecha_Ingreso' });
      errCount++;
      continue;
    }
    if (!str(row.Documento_Identidad)) {
      errorLog.push({ fila: rowNum, motivo: 'Campo requerido vacío: Documento_Identidad' });
      errCount++;
      continue;
    }

    const documento = str(row.Documento_Identidad);

    // ── Lookup de catálogos (normalizado en ambos lados) ────────────────────
    const idArea = lookup(maps.areaMap, row.Area, AREA_ALIASES);
    if (!idArea) {
      errorLog.push({ fila: rowNum, motivo: `Area no encontrada: "${row.Area}"` });
      errCount++;
      continue;
    }

    const idPuesto = lookup(maps.puestoMap, row.Puesto, PUESTO_ALIASES);
    if (!idPuesto) {
      errorLog.push({ fila: rowNum, motivo: `Puesto no encontrado: "${row.Puesto}"` });
      errCount++;
      continue;
    }

    const idHorario = lookup(maps.horarioMap, row.Tipo_Horario, HORARIO_ALIASES);
    if (!idHorario) {
      errorLog.push({ fila: rowNum, motivo: `Tipo_Horario no encontrado: "${row.Tipo_Horario}"` });
      errCount++;
      continue;
    }

    const idNacionalidad = lookup(maps.nacionalidadMap, firstVal(row.Nacionalidad));
    if (!idNacionalidad) {
      errorLog.push({
        fila: rowNum,
        motivo: `Nacionalidad no encontrada: "${row.Nacionalidad}"`,
      });
      errCount++;
      continue;
    }

    // ── Idempotencia ────────────────────────────────────────────────────────
    const existing = await prisma.empleados.findUnique({
      where: { Documento_Identidad: documento },
      select: { ID_Empleado: true },
    });

    const salario = maps.puestoSalaryMap.get(idPuesto) ?? { mensual: 9451.20, diario: 315.04 };

    if (existing) {
      try {
        await prisma.empleados.update({
          where: { Documento_Identidad: documento },
          data: {
            Salario_Mensual: salario.mensual,
            Salario_Diario:  salario.diario,
            UpdatedBy:       'IMPORT_CSV',
          },
        });
        updated++;
      } catch (err) {
        errorLog.push({ fila: rowNum, motivo: `Error actualizando salario: ${err.message}` });
        errCount++;
      }
      continue;
    }

    // ── Inserción ───────────────────────────────────────────────────────────
    try {
      await prisma.empleados.create({
        data: {
          // Datos personales  (límites según schema VarChar)
          Nombre:            cap(row.Nombre,           50),
          Apellido_Paterno:  cap(row.Apellido_Paterno, 50),
          Apellido_Materno:  cap(row.Apellido_Materno, 50),
          Fecha_Nacimiento:  toDate(row.Fecha_Nacimiento),  // null si inválida u omitida

          // Identidad
          ID_Nacionalidad:     idNacionalidad,
          Documento_Identidad: cap(documento,           50),
          Tipo_Documento:      cap(row.Tipo_Documento,  20),
          RFC:                 cap(row.RFC,             13),
          NSS:                 cap(row.NSS,             20),

          // Contacto
          Email_Personal:        cap(row.Email_Personal,        100),
          Email_Corporativo:     cap(row.Email_Corporativo,     100),
          Telefono_Celular:      cap(row.Telefono_Celular,       20),
          Telefono_Emergencia:   cap(row.Telefono_Emergencia,    20),
          Nombre_Emergencia:     cap(row.Nombre_Emergencia,     100),
          Parentesco_Emergencia: cap(row.Parentesco_Emergencia,  50),

          // Dirección
          Calle:              cap(row.Calle,              100),
          Numero_Exterior:    cap(row.Numero_Exterior,     10),
          Numero_Interior:    cap(row.Numero_Interior,     10),
          Colonia:            cap(row.Colonia,             50),
          Ciudad:             cap(row.Ciudad,              50),
          Entidad_Federativa: cap(row.Entidad_Federativa,  50),
          Codigo_Postal:      cap(row.Codigo_Postal,       10),  // String, no parseInt

          // Relación laboral
          ID_Puesto:       idPuesto,
          ID_Area:         idArea,
          ID_Tipo_Horario: idHorario,

          // Salarios tomados del puesto de catálogo
          Salario_Mensual:             salario.mensual,
          Salario_Diario:              salario.diario,
          Salario_Hora:                null,
          Horas_Semanales_Contratadas: null,

          // Estatus
          ID_Estatus:    1,  // Activo
          Fecha_Ingreso: toDate(row.Fecha_Ingreso),

          // Auditoría
          CreatedBy: 'IMPORT_CSV',
        },
      });

      inserted++;
    } catch (err) {
      errorLog.push({ fila: rowNum, motivo: err.message });
      errCount++;
    }
  }

  // 4. Reporte final
  console.log('='.repeat(40));
  console.log(`${inserted} registros insertados`);
  console.log(`${updated} registros actualizados (salario)`);
  console.log(`${errCount} registros con errores`);

  if (errorLog.length) {
    console.log('');
    console.log('Errores:');
    for (const e of errorLog) {
      console.log(`  Fila ${e.fila}: ${e.motivo}`);
    }
  }

  console.log('='.repeat(40));
}

main()
  .catch((err) => {
    console.error('Error fatal:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
