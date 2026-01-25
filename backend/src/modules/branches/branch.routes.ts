import { Router } from 'express';
import { branchController } from './branch.controller';
import { legacyAdminAuthWithRateLimit } from '../../middleware/adminAuth';

const router = Router();

// Public route - List all branches (for branch selection screen)
router.get('/', branchController.getAll);

// Public route - Get single branch (for branch info display)
router.get('/:id', branchController.getOne);

// Admin routes (require admin authentication with rate limiting)
// Note: Using legacy admin auth for backward compatibility during transition
// This should be changed to adminAuthWithRateLimit after migration period
router.post('/', legacyAdminAuthWithRateLimit, branchController.create);
router.put('/:id', legacyAdminAuthWithRateLimit, branchController.update);
router.delete('/:id', legacyAdminAuthWithRateLimit, branchController.delete);

export default router;