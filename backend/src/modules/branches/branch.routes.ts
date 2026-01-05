import { Router } from 'express';
import { branchController } from './branch.controller';
import { adminAuth } from '../../middleware/adminAuth';

const router = Router();

router.get('/', branchController.getAll);
router.post('/', adminAuth, branchController.create);

export default router;
