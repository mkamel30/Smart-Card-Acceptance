import { Request, Response } from 'express';
import { prisma } from '../../config/database';

export class BranchController {

    // Public: List all branches for login screen
    async getAll(_req: Request, res: Response) {
        try {
            const branches = await prisma.branch.findMany({
                orderBy: { name: 'asc' }
            });
            res.json(branches);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch branches' });
        }
    }

    // Admin Only: Create new branch
    async create(req: Request, res: Response) {
        try {
            const { name, code } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
            }

            const branch = await prisma.branch.create({
                data: {
                    name,
                    code: code || undefined
                }
            });

            res.status(201).json(branch);
        } catch (error: any) {
            // Handle unique constraint error
            if (error.code === 'P2002') {
                return res.status(409).json({ error: 'Branch name already exists' });
            }
            res.status(500).json({ error: 'Failed to create branch' });
        }
    }
}

export const branchController = new BranchController();
