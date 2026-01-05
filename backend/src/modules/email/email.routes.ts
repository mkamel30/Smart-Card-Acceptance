import { Router } from 'express';
import emailController from './email.controller';

const router = Router();

router.post('/send/:id', emailController.send);
router.post('/batch/:batchNumber/send', emailController.sendBatch);

export default router;
