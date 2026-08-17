import { Router } from 'express';
import * as notificacionesController from '../controllers/notificacionesController.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = Router();
router.use(isAuthenticated);

router.get('/', notificacionesController.listar);
router.post('/:id/leer', notificacionesController.marcarLeida);
router.post('/leer-todas', notificacionesController.marcarTodasLeidas);

export default router;
