# 🗺️ ROADMAP - Plan de Desarrollo Futuro

Este documento describe las optimizaciones pendientes, funcionalidades futuras, y el estado de cumplimiento normativo del sistema ERP de Recursos Humanos.

---

## 📊 Estado Actual del Sistema

### ✅ Funcionalidades Implementadas

| Módulo | Estado | Descripción |
|--------|--------|-------------|
| Empleados | ✅ Completo | CRUD, filtros, paginación, búsqueda |
| Áreas | ✅ Completo | Catálogo con empleados asociados |
| Puestos | ✅ Completo | Catálogo con salarios de referencia |
| Horarios | ✅ Completo | Tipos de jornada laboral |
| Nacionalidades | ✅ Completo | Catálogo de países |
| Usuarios | ✅ Completo | Gestión con roles y permisos |
| Horas Adicionales | ✅ Básico | Registro y aprobación |
| Períodos Nómina | ✅ Completo | CRUD de períodos de pago |
| Nómina | ✅ Básico | Cálculo de percepciones y deducciones |
| Vacaciones | ✅ Completo | Cálculo LFT, registro, aprobación |
| Aguinaldo | ✅ Completo | Cálculo proporcional, ISR |
| Finiquito | ✅ Completo | Cálculo completo LFT |
| Liquidación | ✅ Completo | Indemnización + prima antigüedad |
| Autenticación | ✅ Completo | Passport.js con sesiones |
| Auditoría | ✅ Básico | Bitácora de accesos |

---

## ⏳ Funcionalidades Pendientes Prioritarias

### 🔴 Alta Prioridad

#### 1. Contador de Horas Trabajadas Diarias
**Estado**: ❌ No implementado

El sistema actualmente no cuenta con un módulo para registrar las horas trabajadas diariamente por cada empleado.

**Requerimientos**:
- [ ] Modelo `Registro_Asistencia` con campos:
  - ID_Empleado
  - Fecha
  - Hora_Entrada
  - Hora_Salida
  - Hora_Entrada_Comida
  - Hora_Salida_Comida
  - Total_Horas
  - Tipo_Registro (NORMAL, FALTA, PERMISO, INCAPACIDAD)
- [ ] Vista de registro de entradas/salidas
- [ ] Cálculo automático de horas trabajadas
- [ ] Reporte de horas por empleado/período
- [ ] Integración con cálculo de nómina
- [ ] Alerta de horas incompletas

**Impacto**: Fundamental para el cálculo correcto de nómina basado en horas trabajadas.

#### 2. Reloj Checador Digital
**Estado**: ❌ No implementado

- [ ] Interfaz de check-in/check-out para empleados
- [ ] Autenticación por PIN, credencial o biométrico
- [ ] Geolocalización opcional
- [ ] Modo kiosco para terminal de entrada

#### 3. Cálculo de ISR Mensual Completo
**Estado**: ⚠️ Parcial

- [ ] Tabla de ISR actualizable por año fiscal
- [ ] Subsidio al empleo
- [ ] Cálculo mensual y anual
- [ ] Declaraciones mensuales
- [ ] Ajuste anual de ISR

---

### 🟡 Prioridad Media

#### 4. Gestión de Incidencias
- [ ] Faltas justificadas/injustificadas
- [ ] Permisos con/sin goce de sueldo
- [ ] Incapacidades (IMSS, maternidad, paternidad)
- [ ] Días económicos
- [ ] Suspensiones

#### 5. Control de Préstamos y Descuentos
- [ ] Préstamos a empleados
- [ ] Abonos periódicos automáticos
- [ ] Descuentos de caja de ahorro
- [ ] Descuentos INFONAVIT
- [ ] Descuentos FONACOT

#### 6. Días Festivos Oficiales
**Estado**: ⚠️ Modelo existe, sin interfaz

- [ ] Vista CRUD de días festivos
- [ ] Carga masiva de días por año
- [ ] Cálculo de prima dominical
- [ ] Pago de días festivos trabajados (doble o triple)

#### 7. PTU (Participación de los Trabajadores en las Utilidades)
- [ ] Cálculo según Art. 117-131 LFT
- [ ] 10% de utilidades fiscales
- [ ] Distribución 50% días trabajados, 50% salarios
- [ ] Reporte para declaración anual

#### 8. CFDI de Nómina (Timbrado)
- [ ] Integración con PAC (Proveedor Autorizado de Certificación)
- [ ] Generación de XML de nómina
- [ ] Almacenamiento de CFDI
- [ ] Envío automático por email
- [ ] Catálogos SAT actualizados

---

### 🟢 Prioridad Baja

#### 9. Expediente Digital del Empleado
- [ ] Carga de documentos (INE, acta, CURP, etc.)
- [ ] Contratos firmados digitalmente
- [ ] Historial de cambios de puesto/salario
- [ ] Evaluaciones de desempeño

#### 10. Portal de Autoservicio para Empleados
- [ ] Consulta de recibos de nómina
- [ ] Solicitud de vacaciones
- [ ] Consulta de saldo de vacaciones
- [ ] Actualización de datos personales
- [ ] Descarga de constancias

#### 11. Reportes Avanzados
- [ ] Exportación a Excel/PDF
- [ ] Dashboard con gráficas interactivas
- [ ] Comparativos por período
- [ ] Reportes de costos por departamento
- [ ] Proyecciones de nómina

#### 12. Integración con Bancos
- [ ] Generación de layout de dispersión bancaria
- [ ] Formatos para principales bancos mexicanos
- [ ] Conciliación de pagos

---

## ⚖️ Cumplimiento Normativo

### ✅ Normativas Implementadas

| Normativa | Artículos | Estado |
|-----------|-----------|--------|
| **LFT - Vacaciones** | Art. 76, 78 | ✅ Completo |
| **LFT - Prima Vacacional** | Art. 80 | ✅ Completo |
| **LFT - Aguinaldo** | Art. 87 | ✅ Completo |
| **LFT - Finiquito** | Art. 47, 48, 50 | ✅ Completo |
| **LFT - Liquidación** | Art. 48, 50, 162 | ✅ Completo |
| **LFT - Prima Antigüedad** | Art. 162 | ✅ Completo |
| **LFT - Jornadas Laborales** | Art. 60, 61 | ✅ Parcial |
| **LFT - Horas Extra** | Art. 67, 68 | ✅ Básico |

### ⏳ Normativas Pendientes

| Normativa | Artículos | Estado | Prioridad |
|-----------|-----------|--------|-----------|
| **LISR - ISR Nómina** | Art. 94-99 | ⚠️ Básico | Alta |
| **LSS - Cuotas IMSS** | Varios | ⚠️ Básico | Alta |
| **LSS - Incapacidades** | Art. 96-98 | ❌ Pendiente | Media |
| **LFT - Descansos Obligatorios** | Art. 74 | ⚠️ Modelo existe | Media |
| **LFT - PTU** | Art. 117-131 | ❌ Pendiente | Media |
| **CFDI Nómina 4.0** | SAT | ❌ Pendiente | Alta |
| **INFONAVIT** | Ley INFONAVIT | ❌ Pendiente | Baja |
| **FONACOT** | Ley FONACOT | ❌ Pendiente | Baja |

---

## 🔧 Optimizaciones Técnicas Pendientes

### Rendimiento

- [ ] **Caché de consultas frecuentes**: Implementar Redis para cachear catálogos
- [ ] **Paginación del lado del servidor**: Optimizar consultas con cursor-based pagination
- [ ] **Lazy loading de relaciones**: Evitar cargar todas las relaciones en cada consulta
- [ ] **Índices de base de datos**: Agregar índices para búsquedas frecuentes
- [ ] **Query optimization**: Revisar N+1 queries en Prisma

### Seguridad

- [ ] **Rate limiting por usuario**: Protección contra abuso de endpoints
- [ ] **Refresh tokens**: Implementar tokens de refresco para sesiones largas
- [ ] **Encriptación de datos sensibles**: Encriptar RFC, NSS, etc.
- [ ] **2FA**: Autenticación de dos factores para admins
- [ ] **Logs de auditoría completos**: Registrar todas las operaciones CRUD
- [ ] **HTTPS forzado**: Configuración de certificados SSL

### Código

- [ ] **Validación centralizada**: Usar Joi o Zod para validación de inputs
- [ ] **Manejo de transacciones**: Envolver operaciones relacionadas en transacciones
- [ ] **Testing**: Implementar pruebas unitarias y de integración
- [ ] **Documentación API**: Swagger/OpenAPI para endpoints
- [ ] **Migrar a TypeScript**: Tipado estático para mejor mantenibilidad
- [ ] **CI/CD**: Pipeline de integración continua

### UX/UI

- [ ] **Modo oscuro**: Tema oscuro para la interfaz
- [ ] **Responsive mejorado**: Optimizar para dispositivos móviles
- [ ] **PWA**: Convertir a Progressive Web App
- [ ] **Notificaciones push**: Alertas de vencimientos, aprobaciones pendientes
- [ ] **Multi-idioma**: Soporte para inglés

---

## 📅 Propuesta de Sprints

### Sprint 1 (2 semanas) - Control de Asistencia
- Modelo de Registro_Asistencia
- CRUD de asistencia
- Reloj checador básico
- Reporte de horas

### Sprint 2 (2 semanas) - ISR Completo
- Tabla de ISR configurable
- Subsidio al empleo
- Cálculo mensual correcto
- Ajuste anual

### Sprint 3 (2 semanas) - Incidencias
- Modelo de incidencias
- Faltas, permisos, incapacidades
- Integración con nómina
- Reportes

### Sprint 4 (2 semanas) - CFDI Nómina
- Integración con PAC
- Generación de XML
- Timbrado
- Almacenamiento y consulta

### Sprint 5 (2 semanas) - Portal Empleados
- Autenticación de empleados
- Consulta de recibos
- Solicitud de vacaciones
- Autoservicio

---

## 📈 Métricas de Éxito

| Métrica | Objetivo | Estado Actual |
|---------|----------|---------------|
| Módulos principales | 100% | 80% |
| Cumplimiento LFT | 100% | 85% |
| Cumplimiento fiscal | 100% | 40% |
| Test coverage | >80% | 0% |
| Performance (response time) | <500ms | ~800ms |
| Uptime | 99.9% | N/A |

---

## 🤝 Contribuciones

Para contribuir al proyecto:

1. Fork del repositorio
2. Crear rama feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit de cambios (`git commit -m 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

---

## 📞 Contacto

Para reportar bugs o solicitar funcionalidades, crear un Issue en el repositorio.

---

*Última actualización: Enero 2026*
