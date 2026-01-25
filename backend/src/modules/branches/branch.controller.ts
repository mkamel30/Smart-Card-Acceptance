import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { CreateBranchSchema, UpdateBranchSchema, BranchFilterInput } from '../settlements/settlement.dto';
import { ZodError } from 'zod';

export class BranchController {

    // Public: List all branches for login screen
    async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            // Parse and validate query parameters
            const filter = BranchFilterSchema.parse(req.query);
            
            const where: any = {};
            
            if (filter.name) {
                where.name = {
                    contains: filter.name,
                    mode: 'insensitive'
                };
            }
            
            if (filter.code) {
                where.code = {
                    contains: filter.code,
                    mode: 'insensitive'
                };
            }

            const skip = (filter.page - 1) * filter.limit;

            const [branches, total] = await Promise.all([
                prisma.branch.findMany({
                    where,
                    orderBy: { name: 'asc' },
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        createdAt: true,
                        _count: {
                            select: {
                                settlements: true,
                                managers: true
                            }
                        }
                    },
                    skip,
                    take: filter.limit
                }),
                prisma.branch.count({ where })
            ]);

            res.json({
                data: branches,
                pagination: {
                    page: filter.page,
                    limit: filter.limit,
                    total,
                    pages: Math.ceil(total / filter.limit)
                }
            });
        } catch (error: any) {
            if (error instanceof ZodError) {
                return res.status(400).json({
                    error: 'Validation error',
                    details: error.errors.map(err => ({
                        field: err.path.join('.'),
                        message: err.message,
                        code: err.code
                    }))
                });
            }
            next(error);
        }
    }

    // Public: Get single branch
    async getOne(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            
            const branch = await prisma.branch.findUnique({
                where: { id },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    createdAt: true,
                    _count: {
                        select: {
                            settlements: true,
                            managers: true
                        }
                    }
                }
            });

            if (!branch) {
                return res.status(404).json({ 
                    error: 'Branch not found',
                    code: 'BRANCH_NOT_FOUND'
                });
            }

            res.json(branch);
        } catch (error) {
            next(error);
        }
    }

    // Admin Only: Create new branch
    async create(req: Request, res: Response, next: NextFunction) {
        try {
            // Validate input data
            const validatedData = CreateBranchSchema.parse(req.body);

            // Check if branch name already exists
            const existingBranch = await prisma.branch.findUnique({
                where: { name: validatedData.name }
            });

            if (existingBranch) {
                return res.status(409).json({ 
                    error: 'Branch name already exists',
                    code: 'BRANCH_NAME_EXISTS',
                    field: 'name'
                });
            }

            // Check if branch code already exists (if provided)
            if (validatedData.code) {
                const existingCode = await prisma.branch.findUnique({
                    where: { code: validatedData.code }
                });

                if (existingCode) {
                    return res.status(409).json({ 
                        error: 'Branch code already exists',
                        code: 'BRANCH_CODE_EXISTS',
                        field: 'code'
                    });
                }
            }

            const branch = await prisma.branch.create({
                data: {
                    name: validatedData.name.trim(),
                    code: validatedData.code?.trim() || undefined
                },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    createdAt: true
                }
            });

            res.status(201).json({
                message: 'Branch created successfully',
                data: branch
            });
        } catch (error: any) {
            if (error instanceof ZodError) {
                return res.status(400).json({
                    error: 'Validation error',
                    details: error.errors.map(err => ({
                        field: err.path.join('.'),
                        message: err.message,
                        code: err.code
                    }))
                });
            }

            // Handle Prisma unique constraint errors
            if (error.code === 'P2002') {
                const target = error.meta?.target as string[];
                if (target?.includes('name')) {
                    return res.status(409).json({ 
                        error: 'Branch name already exists',
                        code: 'BRANCH_NAME_EXISTS',
                        field: 'name'
                    });
                }
                if (target?.includes('code')) {
                    return res.status(409).json({ 
                        error: 'Branch code already exists',
                        code: 'BRANCH_CODE_EXISTS',
                        field: 'code'
                    });
                }
            }

            next(error);
        }
    }

    // Admin Only: Update branch
    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const validatedData = UpdateBranchSchema.parse({ ...req.body, id });

            // Check if branch exists
            const existingBranch = await prisma.branch.findUnique({
                where: { id }
            });

            if (!existingBranch) {
                return res.status(404).json({ 
                    error: 'Branch not found',
                    code: 'BRANCH_NOT_FOUND'
                });
            }

            // Check for duplicate name (if changing)
            if (validatedData.name && validatedData.name !== existingBranch.name) {
                const duplicateName = await prisma.branch.findUnique({
                    where: { name: validatedData.name }
                });

                if (duplicateName) {
                    return res.status(409).json({ 
                        error: 'Branch name already exists',
                        code: 'BRANCH_NAME_EXISTS',
                        field: 'name'
                    });
                }
            }

            // Check for duplicate code (if changing)
            if (validatedData.code && validatedData.code !== existingBranch.code) {
                const duplicateCode = await prisma.branch.findUnique({
                    where: { code: validatedData.code }
                });

                if (duplicateCode) {
                    return res.status(409).json({ 
                        error: 'Branch code already exists',
                        code: 'BRANCH_CODE_EXISTS',
                        field: 'code'
                    });
                }
            }

            const branch = await prisma.branch.update({
                where: { id },
                data: {
                    ...(validatedData.name && { name: validatedData.name.trim() }),
                    ...(validatedData.code !== undefined && { 
                        code: validatedData.code?.trim() || null 
                    })
                },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    createdAt: true
                }
            });

            res.json({
                message: 'Branch updated successfully',
                data: branch
            });
        } catch (error: any) {
            if (error instanceof ZodError) {
                return res.status(400).json({
                    error: 'Validation error',
                    details: error.errors.map(err => ({
                        field: err.path.join('.'),
                        message: err.message,
                        code: err.code
                    }))
                });
            }

            // Handle Prisma unique constraint errors
            if (error.code === 'P2002') {
                const target = error.meta?.target as string[];
                if (target?.includes('name')) {
                    return res.status(409).json({ 
                        error: 'Branch name already exists',
                        code: 'BRANCH_NAME_EXISTS',
                        field: 'name'
                    });
                }
                if (target?.includes('code')) {
                    return res.status(409).json({ 
                        error: 'Branch code already exists',
                        code: 'BRANCH_CODE_EXISTS',
                        field: 'code'
                    });
                }
            }

            next(error);
        }
    }

    // Admin Only: Delete branch
    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;

            // Check if branch exists
            const existingBranch = await prisma.branch.findUnique({
                where: { id },
                include: {
                    _count: {
                        select: {
                            settlements: true,
                            managers: true
                        }
                    }
                }
            });

            if (!existingBranch) {
                return res.status(404).json({ 
                    error: 'Branch not found',
                    code: 'BRANCH_NOT_FOUND'
                });
            }

            // Prevent deletion if branch has settlements
            if (existingBranch._count.settlements > 0) {
                return res.status(400).json({ 
                    error: 'Cannot delete branch with existing settlements',
                    code: 'BRANCH_HAS_SETTLEMENTS',
                    settlementCount: existingBranch._count.settlements
                });
            }

            // Delete associated users
            await prisma.user.deleteMany({
                where: { branches: { some: { id } } }
            });

            // Delete the branch
            await prisma.branch.delete({
                where: { id }
            });

            res.json({
                message: 'Branch deleted successfully',
                deletedBranch: {
                    id: existingBranch.id,
                    name: existingBranch.name
                }
            });
        } catch (error) {
            next(error);
        }
    }
}

export const branchController = new BranchController();