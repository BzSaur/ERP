import prisma from '../config/database.js';

// ============================================================
// NOTIFICACIONES IN-APP (campana del navbar)
// Sin canal de correo/push en esta iteración. Los disparadores en otros
// controllers deben envolver estas llamadas en try/catch — una notificación
// fallida nunca debe romper el flujo principal.
// ============================================================

export async function crearNotificacion({ idUsuario, tipo, titulo, mensaje, url = null }) {
  if (!idUsuario) return null;
  return prisma.notificaciones.create({
    data: { ID_Usuario: idUsuario, Tipo: tipo, Titulo: titulo, Mensaje: mensaje, Url: url }
  });
}

/**
 * Igual que crearNotificacion pero resuelve el usuario a partir de un
 * ID_Empleado. No-op silencioso si el empleado no tiene usuario vinculado.
 */
export async function crearNotificacionParaEmpleado({ idEmpleado, tipo, titulo, mensaje, url = null }) {
  if (!idEmpleado) return null;
  const usuario = await prisma.app_Usuarios.findUnique({
    where: { ID_Empleado: idEmpleado },
    select: { ID_Usuario: true }
  });
  if (!usuario) return null;
  return crearNotificacion({ idUsuario: usuario.ID_Usuario, tipo, titulo, mensaje, url });
}

export async function listarNotificaciones(idUsuario, { soloNoLeidas = false, limite = 20 } = {}) {
  const where = { ID_Usuario: idUsuario };
  if (soloNoLeidas) where.Leida = false;
  return prisma.notificaciones.findMany({
    where,
    orderBy: { CreatedAt: 'desc' },
    take: limite
  });
}

export async function contarNoLeidas(idUsuario) {
  return prisma.notificaciones.count({ where: { ID_Usuario: idUsuario, Leida: false } });
}

export async function marcarLeida(idUsuario, idNotificacion) {
  return prisma.notificaciones.updateMany({
    where: { ID_Notificacion: idNotificacion, ID_Usuario: idUsuario },
    data: { Leida: true, FechaLeida: new Date() }
  });
}

export async function marcarTodasLeidas(idUsuario) {
  return prisma.notificaciones.updateMany({
    where: { ID_Usuario: idUsuario, Leida: false },
    data: { Leida: true, FechaLeida: new Date() }
  });
}

export default {
  crearNotificacion,
  crearNotificacionParaEmpleado,
  listarNotificaciones,
  contarNoLeidas,
  marcarLeida,
  marcarTodasLeidas
};
