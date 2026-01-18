
import { Router } from 'express';
import analyticsController from './analytics.controller';
import { optionalAuthenticate, authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.get('/summary', optionalAuthenticate, analyticsController.getSummary.bind(analyticsController));
router.get('/charts', optionalAuthenticate, analyticsController.getCharts.bind(analyticsController));
router.get('/transactions', optionalAuthenticate, analyticsController.getTransactions.bind(analyticsController));
router.get('/export', authenticate, analyticsController.exportSettlements.bind(analyticsController));

export default router;
