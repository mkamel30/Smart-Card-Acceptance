import { Router } from 'express';
import settlementController from './settlement.controller';
import { legacyAdminAuthWithRateLimit } from '../../middleware/adminAuth';


const router = Router();

// Public routes (no authentication required for basic functionality)
router.post('/', settlementController.create);
router.get('/', settlementController.getAll);
router.get('/batches', settlementController.getBatches);
router.get('/:id', settlementController.getOne);

// Protected routes (require JWT authentication)
// (Add any settlement-specific protected routes here)

// Admin routes (require admin authentication with rate limiting)
// Note: Using legacy admin auth for backward compatibility during transition
// This should be changed to adminAuthWithRateLimit after migration period
router.post('/batches/:batchNumber/settle', legacyAdminAuthWithRateLimit, settlementController.settleBatch);
router.get('/sync/fees', legacyAdminAuthWithRateLimit, settlementController.syncFees);
router.put('/:id', legacyAdminAuthWithRateLimit, settlementController.update);
router.patch('/:id/status', legacyAdminAuthWithRateLimit, settlementController.updateStatus);
router.delete('/:id', legacyAdminAuthWithRateLimit, settlementController.delete);



export default router;