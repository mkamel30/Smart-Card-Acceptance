import { Router } from 'express';
import settlementController from './settlement.controller';
import { unifiedAdminAuthWithRateLimit } from '../../middleware/adminAuth';


const router = Router();

// Public routes (no authentication required for basic functionality)
router.post('/', settlementController.create);
router.get('/', settlementController.getAll);
router.get('/batches', settlementController.getBatches);
router.get('/:id', settlementController.getOne);

// Protected routes (require JWT authentication)
// (Add any settlement-specific protected routes here)

// Admin routes (require admin authentication with rate limiting)
// Note: Using unified admin auth to support both JWT and legacy password
router.post('/batches/:batchNumber/settle', unifiedAdminAuthWithRateLimit, settlementController.settleBatch);
router.put('/batches/:batchNumber', unifiedAdminAuthWithRateLimit, settlementController.updateBatch);
router.get('/sync/fees', unifiedAdminAuthWithRateLimit, settlementController.syncFees);
router.put('/:id', unifiedAdminAuthWithRateLimit, settlementController.update);
router.patch('/:id/status', unifiedAdminAuthWithRateLimit, settlementController.updateStatus);
router.delete('/:id', unifiedAdminAuthWithRateLimit, settlementController.delete);



export default router;