import prisma from '../config/database.js';
import { generarExcelHoras } from './excelHorasService.js';
import { enviarCorreo } from './correoService.js';

const ROLES_DESTINATARIOS = new Set([
  'RH',
  'RECURSOS_HUMANOS',
  'ADMIN',
  'ADMINISTRADOR',
  'SUPERADMIN',
  'SUPER_ADMIN',
  'SUPERADMINISTRADOR'
]);

function normalizarRol(rol) {
  return String(rol || '').toUpperCase().replace(/\s+/g, '_');
}

export function obtenerRangoCicloAsistencia(fecha = new Date()) {
  const hoy = new Date(fecha);
  hoy.setHours(0, 0, 0, 0);

  // El ciclo empieza el viernes y termina el jueves siguiente; el domingo
  // queda fuera del rango de forma natural porque el reporte no tiene datos
  // laborables para ese día.
  const inicio = new Date(hoy);
  inicio.setDate(inicio.getDate() - ((inicio.getDay() + 2) % 7));

  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 6);
  fin.setHours(23, 59, 59, 999);
  return { inicio, fin };
}

function obtenerDestinatarios() {
  return (process.env.REPORTES_ASISTENCIA_EMAILS || '')
    .split(',')
    .map(email => email.trim())
    .filter(Boolean);
}

async function obtenerDestinatariosDesdeUsuarios() {
  const usuarios = await prisma.app_Usuarios.findMany({
    where: { Activo: true },
    select: { Email_Office365: true, rol: { select: { Nombre_Rol: true } } }
  });

  return usuarios
    .filter(usuario => ROLES_DESTINATARIOS.has(normalizarRol(usuario.rol?.Nombre_Rol)))
    .map(usuario => usuario.Email_Office365)
    .filter(Boolean);
}

export async function enviarReporteAsistenciaSemanal(fecha = new Date()) {
  const { inicio, fin } = obtenerRangoCicloAsistencia(fecha);
  const destinatarios = obtenerDestinatarios();
  const destinatariosFinales = destinatarios.length
    ? destinatarios
    : await obtenerDestinatariosDesdeUsuarios();

  if (destinatariosFinales.length === 0) {
    throw new Error('No hay destinatarios: configura REPORTES_ASISTENCIA_EMAILS o usuarios activos con rol RH, ADMIN o SUPERADMIN');
  }

  const buffer = await generarExcelHoras(inicio, fin, { redondear: false, excluirDomingos: true });
  const f1 = inicio.toISOString().slice(0, 10);
  const f2 = fin.toISOString().slice(0, 10);

  await enviarCorreo({
    destinatarios: destinatariosFinales,
    asunto: `Reporte de asistencia ${f1} al ${f2}`,
    texto: `Se adjunta el reporte de asistencia correspondiente al periodo del ${f1} al ${f2}.`,
    adjuntos: [{ filename: `horas_${f1}_a_${f2}.xlsx`, content: buffer }]
  });

  return { inicio, fin, destinatarios: destinatariosFinales };
}

export function iniciarCronReporteAsistencia() {
  const cron = process.env.REPORTES_ASISTENCIA_CRON || '0 22 * * 4';
  const timezone = process.env.REPORTES_ASISTENCIA_TZ || 'America/Mexico_City';

  return import('node-cron').then(({ default: nodeCron }) => {
    const tarea = nodeCron.schedule(cron, async () => {
      try {
        const resultado = await enviarReporteAsistenciaSemanal();
        console.log(`Reporte de asistencia enviado a ${resultado.destinatarios.length} destinatario(s)`);
      } catch (error) {
        console.error('Error al enviar el reporte de asistencia por correo:', error.message);
      }
    }, { timezone });

    console.log(`CRON de asistencia activo: ${cron} (${timezone})`);
    return tarea;
  });
}

export default { enviarReporteAsistenciaSemanal, iniciarCronReporteAsistencia, obtenerRangoCicloAsistencia };
