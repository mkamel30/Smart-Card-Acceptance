import { Router } from 'express';
import pdfController from './pdf.controller';

const router = Router();

router.get('/batch/:batchNumber', pdfController.downloadBatchReport);

export default router;
