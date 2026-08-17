import * as notificacionesService from '../services/notificacionesService.js';

// GET /notificaciones - JSON para el poll del navbar
export const listar = async (req, res, next) => {
  try {
    const [notificaciones, noLeidas] = await Promise.all([
      notificacionesService.listarNotificaciones(req.user.ID_Usuario, { limite: 20 }),
      notificacionesService.contarNoLeidas(req.user.ID_Usuario)
    ]);
    res.json({ notificaciones, noLeidas });
  } catch (error) {
    next(error);
  }
};

// POST /notificaciones/:id/leer
export const marcarLeida = async (req, res, next) => {
  try {
    await notificacionesService.marcarLeida(req.user.ID_Usuario, parseInt(req.params.id));
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

// POST /notificaciones/leer-todas
export const marcarTodasLeidas = async (req, res, next) => {
  try {
    await notificacionesService.marcarTodasLeidas(req.user.ID_Usuario);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export default { listar, marcarLeida, marcarTodasLeidas };
