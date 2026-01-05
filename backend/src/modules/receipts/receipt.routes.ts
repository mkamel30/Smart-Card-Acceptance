import { Router } from 'express';
import receiptController from './receipt.controller';
import { upload } from '../../config/multer';

const router = Router();

router.post('/:settlementId', upload.single('receipt'), receiptController.upload);

export default router;
