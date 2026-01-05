import { Router } from 'express';
import settlementController from './settlement.controller';

const router = Router();

router.post('/', settlementController.create);
router.get('/', settlementController.getAll);
router.get('/batches', settlementController.getBatches);
router.post('/batches/:batchNumber/settle', settlementController.settleBatch);
router.get('/:id', settlementController.getOne);
router.put('/:id', settlementController.update);
router.patch('/:id/status', settlementController.updateStatus);
router.delete('/:id', settlementController.delete);

export default router;
