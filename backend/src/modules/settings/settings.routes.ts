import { Router } from 'express';
import settingsController from './settings.controller';

const router = Router();

router.get('/', settingsController.get);
router.post('/', settingsController.update);

export default router;
