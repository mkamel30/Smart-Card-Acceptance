import { Router } from 'express';
import exportController from './export.controller';

const router = Router();

router.get('/excel', exportController.downloadExcel);
router.get('/batch/:batchNumber/excel', exportController.downloadBatchExcel);
router.get('/pdf/:id', exportController.downloadPDF);

export default router;
