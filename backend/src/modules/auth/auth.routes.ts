
import { Router } from 'express';
import authController from './auth.controller';

const router = Router();

router.post('/login', authController.login.bind(authController));
router.post('/setup-admin', authController.setupInitialAdmin.bind(authController));

export default router;
