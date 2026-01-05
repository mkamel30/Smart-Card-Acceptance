import { Router } from 'express';
import ocrController from './ocr.controller';
import { upload } from '../../config/multer';

const router = Router();

// Standalone OCR scan (does not require a settlement ID)
router.post('/scan', upload.single('receipt'), ocrController.scan);

export default router;
