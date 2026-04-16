# import-employees.js — Importación CSV → VITA

Script CLI que lee un CSV depurado de empleados y los inserta en la base de datos de VITA usando Prisma.

---

## Prerequisitos

1. **Catálogos poblados** — ejecutar los seeds antes del script:
   ```bash
   npm run seed:all
   ```
   El script necesita encontrar `Cat_Areas`, `Cat_Puestos`, `Cat_Tipo_Horario` y `Cat_Nacionalidades` con datos para resolver los IDs.

2. **Instalar csv-parse** (solo la primera vez):
   ```bash
   npm install csv-parse
   ```

3. **Variable de entorno** `DATABASE_URL` configurada (mismo requisito que el resto de la app).

---

## Ejecución

```bash
node scripts/import-employees.js --file=empleados.csv
```

También acepta la forma separada:

```bash
node scripts/import-employees.js --file empleados.csv
```

La ruta del archivo es relativa al directorio de trabajo (`process.cwd()`).

---

## Formato del CSV

26 columnas en este orden exacto (encabezados obligatorios):

```
Nombre, Apellido_Paterno, Apellido_Materno, Fecha_Nacimiento, Tipo_Documento,
Documento_Identidad, Nacionalidad, RFC, NSS, Area, Puesto, Fecha_Ingreso,
Tipo_Horario, Email_Personal, Email_Corporativo, Telefono_Celular,
Telefono_Emergencia, Nombre_Emergencia, Parentesco_Emergencia, Calle,
Numero_Exterior, Numero_Interior, Colonia, Ciudad, Entidad_Federativa,
Codigo_Postal
```

- **Fechas**: formato `YYYY-MM-DD`.
- **Campos opcionales vacíos**: dejar la celda vacía (el script los convierte a `null`).
- **Codificación**: UTF-8 (con o sin BOM).

### Campos obligatorios

| Campo               | Motivo                             |
|---------------------|------------------------------------|
| `Nombre`            | Requerido por el schema            |
| `Apellido_Paterno`  | Requerido por el schema            |
| `Fecha_Ingreso`     | `NOT NULL` en la tabla `Empleados` |
| `Documento_Identidad` | Clave única de idempotencia      |
| `Area`              | Lookup a `Cat_Areas`               |
| `Puesto`            | Lookup a `Cat_Puestos`             |
| `Tipo_Horario`      | Lookup a `Cat_Tipo_Horario`        |
| `Nacionalidad`      | Lookup a `Cat_Nacionalidades`      |

---

## Comportamiento

| Situación | Resultado |
|---|---|
| Empleado nuevo | Se inserta con `ID_Estatus = 1` (Activo) |
| `Documento_Identidad` ya existe | Se **salta** (no actualiza, no duplica) |
| Área / Puesto / Horario / Nacionalidad no encontrado | Se **registra el error** y continúa con la siguiente fila |
| `Fecha_Ingreso` vacía | Se registra error y se salta la fila |
| `Nombre` o `Apellido_Paterno` vacío | Se registra error y se salta la fila |

Los salarios se insertan con valores fijos (`Salario_Mensual: 9451.20`, `Salario_Diario: 315.04`). `Salario_Hora` y `Horas_Semanales_Contratadas` quedan en `null`.

---

## Salida de ejemplo

```
Archivo  : /proyecto/empleados.csv
Cargando catálogos...
  Areas: 12 | Puestos: 12 | Horarios: 4 | Nacionalidades: 1
Filas    : 5

========================================
4 registros insertados
1 registros saltados (ya existían)
0 registros con errores
========================================
```

---

## Archivo de ejemplo

`scripts/empleados-ejemplo.csv` contiene 5 registros dummy que cubren:

| Fila | Caso |
|------|------|
| 2 | Registro completo (todos los campos) |
| 3 | Campos opcionales vacíos (sin RFC, NSS, emails, teléfonos, dirección) |
| 4 | Sin correo (Email_Personal y Email_Corporativo vacíos) |
| 5 | Fecha_Nacimiento vacía (campo opcional, se inserta con null) |
| 6 | Duplicado de fila 2 → se salta por idempotencia |
