# 🏢 ERP - Sistema de Gestión de Recursos Humanos y Nómina

Sistema ERP integral para la gestión de personal y cálculo de nómina, desarrollado con Node.js, Express, Prisma y PostgreSQL. Implementa las regulaciones de la **Ley Federal del Trabajo (LFT) de México**.

## 📋 Características Principales

### Gestión de Personal
- ✅ **Gestión de Empleados**: CRUD completo con filtros, paginación y búsqueda
- ✅ **Catálogo de Áreas**: Organización departamental
- ✅ **Catálogo de Puestos**: Puestos con salarios de referencia por área
- ✅ **Nacionalidades**: Catálogo de países para empleados
- ✅ **Tipos de Horario**: Jornadas completa, medio tiempo, por horas, mixta

### Sistema de Nómina
- ✅ **Períodos de Nómina**: Quincenal, semanal, mensual, catorcenal
- ✅ **Cálculo de Nómina**: Percepciones, deducciones, ISR, IMSS
- ✅ **Horas Adicionales**: Registro y aprobación (presencial, en línea, extra, doble, triple)
- ✅ **Recibos de Nómina**: Generación y visualización

### Prestaciones (Conforme a LFT)
- ✅ **Vacaciones**: Cálculo según antigüedad (Art. 76, 78 LFT)
- ✅ **Prima Vacacional**: 25% mínimo (Art. 80 LFT)
- ✅ **Aguinaldo**: 15 días mínimo, proporcional (Art. 87 LFT)
- ✅ **Finiquito**: Días trabajados + vacaciones + prima + aguinaldo proporcional
- ✅ **Liquidación**: Finiquito + 3 meses indemnización + prima antigüedad (Art. 48, 50, 162 LFT)

### Seguridad y Auditoría
- ✅ **Autenticación**: Login con Passport.js y sesiones
- ✅ **Control de Acceso**: Roles (SUPER_ADMIN, ADMIN, RH, CONSULTA)
- ✅ **Auditoría**: Bitácora de accesos y cambios
- ✅ **Docker Ready**: Configuración para desarrollo y producción

### Reportes
- ✅ **Dashboard General**: Estadísticas de empleados, áreas, puestos
- ✅ **Dashboard de Nómina**: Resumen de pagos por período
- ✅ **Por Área**: Distribución de empleados
- ✅ **Por Horario**: Empleados por tipo de jornada
- ✅ **Altas y Bajas**: Movimientos de personal

## 🛠️ Stack Tecnológico

| Componente | Tecnología |
|------------|------------|
| **Backend** | Node.js 20+ / Express 4.18 |
| **Base de Datos** | PostgreSQL 16+ |
| **ORM** | Prisma 5.7 |
| **Vistas** | EJS (Server-Side Rendering) |
| **Estilos** | Bootstrap 5.3 + CSS personalizado (SIMOD Theme) |
| **Autenticación** | Passport.js (Local Strategy) |
| **Sesiones** | express-session + connect-flash |
| **Contenedores** | Docker & Docker Compose |

## 📁 Estructura del Proyecto

```
erp-rh/
├── src/
│   ├── config/
│   │   └── database.js              # Configuración Prisma
│   ├── middleware/
│   │   ├── auth.js                  # Autenticación y roles
│   │   └── errorHandler.js          # Manejo de errores
│   ├── controllers/
│   │   ├── empleadosController.js   # CRUD empleados
│   │   ├── nominaController.js      # Cálculo de nómina
│   │   ├── vacacionesController.js  # Gestión de vacaciones
│   │   ├── aguinaldoController.js   # Cálculo de aguinaldo
│   │   ├── finiquitoController.js   # Finiquito y liquidación
│   │   └── ...                      # Otros controladores
│   ├── routes/
│   │   ├── index.js                 # Router principal
│   │   ├── nomina.js                # Rutas de nómina
│   │   ├── vacaciones.js            # Rutas de vacaciones
│   │   ├── aguinaldo.js             # Rutas de aguinaldo
│   │   ├── finiquito.js             # Rutas de finiquito
│   │   └── ...                      # Otras rutas
│   ├── views/
│   │   ├── layout.ejs               # Layout principal
│   │   ├── partials/
│   │   │   ├── sidebar.ejs          # Menú lateral
│   │   │   └── navbar.ejs           # Barra superior
│   │   ├── empleados/               # Vistas de empleados
│   │   ├── nomina/                  # Vistas de nómina
│   │   ├── vacaciones/              # Vistas de vacaciones
│   │   ├── aguinaldo/               # Vistas de aguinaldo
│   │   ├── finiquito/               # Vistas de finiquito
│   │   └── ...                      # Otras vistas
│   └── app.js                       # Configuración Express
├── prisma/
│   ├── schema.prisma                # Modelo de datos
│   ├── migrations/                  # Migraciones
│   └── seed.js                      # Datos iniciales
├── public/
│   ├── css/                         # Estilos personalizados
│   └── js/                          # Scripts del cliente
├── .env                             # Variables de entorno
├── docker-compose.yml               # Configuración Docker
├── server.js                        # Punto de entrada
├── README.md                        # Esta documentación
├── ROADMAP.md                       # Plan de desarrollo futuro
└── package.json
```

## 🚀 Instalación

### Requisitos Previos

- Node.js 20+
- PostgreSQL 16+ (o Docker)
- npm o yarn

### Opción 1: Desarrollo Local

```bash
# 1. Clonar el repositorio
git clone <tu-repo>
cd erp-rh

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de PostgreSQL

# 4. Generar cliente Prisma
npx prisma generate

# 5. Ejecutar migraciones
npx prisma migrate dev

# 6. Insertar datos iniciales
npm run seed

# 7. Iniciar en desarrollo
npm run dev
```

### Opción 2: Con Docker

```bash
# 1. Clonar el repositorio
git clone <tu-repo>
cd erp-rh

# 2. Configurar variables de entorno
cp .env.example .env

# 3. Construir e iniciar contenedaores
docker-compose up -d

# 4. Ejecutar migraciones (primera vez)
docker-compose exec app npx prisma migrate deploy

# 5. Insertar datos iniciales
docker-compose exec app npm run seed
```

## 🔐 Credenciales por Defecto

Después de ejecutar el seed:

| Campo | Valor |
|-------|-------|
| Email | `agomezj2101@alumno.ipn.mx` |
| Password | `password123` |
| Rol | SUPER_ADMIN |

⚠️ **IMPORTANTE**: Cambiar la contraseña en producción.

## 📦 Scripts Disponibles

```bash
npm start              # Iniciar servidor (producción)
npm run dev            # Iniciar con nodemon (desarrollo)
npm run seed           # Insertar datos iniciales

# Prisma
npm run prisma:generate  # Generar cliente
npm run prisma:migrate   # Ejecutar migraciones
npm run prisma:studio    # Abrir Prisma Studio (GUI)
```

## 🌐 URLs del Sistema

| Servicio | URL | Descripción |
|----------|-----|-------------|
| Aplicación | http://localhost:3001 | Sistema ERP principal |
| Prisma Studio | http://localhost:5555 | Gestión de BD (desarrollo) |
| PgAdmin | http://localhost:5050 | Administrador PostgreSQL (Docker) |

## 📊 Módulos del Sistema

### Menú Principal
- **Dashboard**: Resumen general del sistema
- **Empleados**: Gestión completa de personal
- **Áreas**: Catálogo de departamentos
- **Puestos**: Catálogo de puestos por área
- **Horarios**: Tipos de jornada laboral
- **Horas Adicionales**: Registro de horas extra

### Menú Nómina
- **Dashboard Nómina**: Estadísticas de pagos
- **Períodos**: Gestión de períodos de pago
- **Vacaciones**: Control de días de vacaciones
- **Aguinaldo**: Cálculo de aguinaldo anual
- **Finiquito**: Cálculo de finiquito/liquidación

### Configuración
- **Usuarios**: Gestión de usuarios del sistema
- **Nacionalidades**: Catálogo de países
- **Configuración**: Parámetros del sistema

## ⚖️ Cumplimiento Legal (LFT México)

Este sistema implementa los cálculos conforme a la **Ley Federal del Trabajo**:

| Concepto | Artículo LFT | Implementación |
|----------|--------------|----------------|
| Vacaciones | Art. 76, 78 | 12 días primer año, +2 por año hasta 5°, +2 cada 5 años |
| Prima Vacacional | Art. 80 | 25% mínimo sobre días de vacaciones |
| Aguinaldo | Art. 87 | 15 días de salario mínimo |
| Indemnización | Art. 48, 50 | 3 meses de salario por despido injustificado |
| Prima Antigüedad | Art. 162 | 12 días por año trabajado (tope 2 SM) |
| Jornada Máxima | Art. 61 | 8 hrs diurna, 7 hrs nocturna, 7.5 hrs mixta |
| Horas Extra | Art. 67, 68 | Dobles primeras 9 hrs/semana, triples después |

## 🔒 Roles y Permisos

| Rol | Empleados | Nómina | Catálogos | Reportes | Usuarios |
|-----|-----------|--------|-----------|----------|----------|
| SUPER_ADMIN | CRUD | CRUD | CRUD | Ver | CRUD |
| ADMIN | CRUD | CRUD | CRUD | Ver | Ver |
| RH | CRUD | Ver/Aprobar | Ver | Ver | - |
| CONSULTA | Ver | Ver | Ver | Ver | - |

## 🐳 Despliegue en Producción (EC2)

```bash
# 1. Conectar a EC2
ssh -i "tu-key.pem" ubuntu@tu-ip-ec2

# 2. Instalar Docker
sudo apt update
sudo apt install docker.io docker-compose -y

# 3. Clonar y configurar
git clone <tu-repo>
cd erp-rh
nano .env  # Configurar NODE_ENV=production

# 4. Construir e iniciar
sudo docker-compose up -d --build

# 5. Ejecutar migraciones
sudo docker-compose exec app npx prisma migrate deploy
sudo docker-compose exec app npm run seed
```

## 📝 Licencia

ISC

## 👨‍💻 Información del Proyecto

Sistema desarrollado para gestión integral de recursos humanos con énfasis en cumplimiento de la legislación laboral mexicana.

---

📌 **Ver [ROADMAP.md](ROADMAP.md)** para conocer las optimizaciones futuras y funcionalidades planeadas.
