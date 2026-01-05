
import { Router } from 'express';
import analyticsController from './analytics.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.get('/summary', authenticate, analyticsController.getSummary.bind(analyticsController));
router.get('/charts', authenticate, analyticsController.getCharts.bind(analyticsController));

export default router;
