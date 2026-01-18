import { Router } from 'express';
import settlementController from './settlement.controller';
import { adminAuth } from '../../middleware/adminAuth';

const router = Router();

router.post('/', settlementController.create);
router.get('/', settlementController.getAll);
router.get('/batches', settlementController.getBatches);
router.post('/batches/:batchNumber/settle', settlementController.settleBatch);
router.get('/:id', settlementController.getOne);
router.put('/:id', adminAuth, settlementController.update);
router.patch('/:id/status', adminAuth, settlementController.updateStatus);
router.delete('/:id', adminAuth, settlementController.delete);
router.post('/sync/fees', adminAuth, settlementController.syncFees);

export default router;
