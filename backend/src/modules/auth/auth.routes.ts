import { Router } from 'express';
import authController from './auth.controller';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware';

const router = Router();

// Public routes
router.post('/login', authController.login);

// Protected routes
router.get('/profile', authenticate, authController.getUserProfile);
router.post('/refresh', authenticate, authController.refreshToken);

// Admin routes
router.post('/users', authenticate, requireAdmin, authController.createUser);

export default router;