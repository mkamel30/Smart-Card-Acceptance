import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { LoginSchema, CreateUserSchema } from '../settlements/settlement.dto';
import { ZodError } from 'zod';

const getJwtSecret = (): string => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET environment variable is required');
    }
    return secret;
};

export class AuthController {
    async login(req: Request, res: Response, next: NextFunction) {
        try {
            // Validate input
            const validatedData = LoginSchema.parse(req.body);
            const { username, password } = validatedData;

            const user = await prisma.user.findUnique({
                where: { username },
                include: { branches: true }
            });

            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({
                    error: 'اسم المستخدم أو كلمة المرور غير صحيحة',
                    code: 'INVALID_CREDENTIALS'
                });
            }

            const token = jwt.sign(
                {
                    id: user.id,
                    role: user.role,
                    allowedBranches: user.branches.map(b => b.id)
                },
                getJwtSecret(),
                { expiresIn: '1d' }
            );

            res.json({
                message: 'Login successful',
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    branches: user.branches
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

    async createUser(req: Request, res: Response, next: NextFunction) {
        try {
            // This endpoint should require admin authentication
            // TODO: Add admin middleware check

            const validatedData = CreateUserSchema.parse(req.body);
            const { username, password, role, branchIds } = validatedData;

            // Check if user already exists
            const existingUser = await prisma.user.findUnique({
                where: { username }
            });

            if (existingUser) {
                return res.status(409).json({
                    error: 'Username already exists',
                    code: 'USERNAME_EXISTS',
                    field: 'username'
                });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Create user with optional branch assignments
            const userData: any = {
                username,
                password: hashedPassword,
                role
            };

            // If branch manager with branch assignments, create relationships
            if (role === 'BRANCH_MANAGER' && branchIds && branchIds.length > 0) {
                userData.branches = {
                    connect: branchIds.map(id => ({ id }))
                };
            }

            const user = await prisma.user.create({
                data: userData,
                include: { branches: true }
            });

            // Remove password from response
            const { password: _, ...userWithoutPassword } = user;

            res.status(201).json({
                message: 'User created successfully',
                user: userWithoutPassword
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

            // Handle Prisma unique constraint error
            if (error.code === 'P2002') {
                const target = error.meta?.target as string[];
                if (target?.includes('username')) {
                    return res.status(409).json({
                        error: 'Username already exists',
                        code: 'USERNAME_EXISTS',
                        field: 'username'
                    });
                }
            }

            next(error);
        }
    }

    async refreshToken(req: Request, res: Response, next: NextFunction) {
        try {
            // This endpoint would validate the current token and issue a new one
            // Implementation depends on your specific requirements

            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).json({
                    error: 'No token provided',
                    code: 'NO_AUTH_HEADER'
                });
            }

            const token = authHeader.split(' ')[1];
            if (!token) {
                return res.status(401).json({
                    error: 'Invalid token format',
                    code: 'INVALID_TOKEN_FORMAT'
                });
            }

            try {
                const decoded = jwt.verify(token, getJwtSecret()) as any;

                // Get fresh user data
                const user = await prisma.user.findUnique({
                    where: { id: decoded.id },
                    include: { branches: true }
                });

                if (!user) {
                    return res.status(401).json({
                        error: 'User not found',
                        code: 'USER_NOT_FOUND'
                    });
                }

                // Issue new token
                const newToken = jwt.sign(
                    {
                        id: user.id,
                        role: user.role,
                        allowedBranches: user.branches.map(b => b.id)
                    },
                    getJwtSecret(),
                    { expiresIn: '1d' }
                );

                res.json({
                    message: 'Token refreshed successfully',
                    token: newToken
                });
            } catch (jwtError) {
                if (jwtError instanceof jwt.TokenExpiredError) {
                    return res.status(401).json({
                        error: 'Token expired',
                        code: 'TOKEN_EXPIRED'
                    });
                }
                if (jwtError instanceof jwt.JsonWebTokenError) {
                    return res.status(401).json({
                        error: 'Invalid token',
                        code: 'INVALID_TOKEN'
                    });
                }
                throw jwtError;
            }
        } catch (error) {
            next(error);
        }
    }

    async getUserProfile(req: Request, res: Response, next: NextFunction) {
        try {
            // This would be used by the frontend to get current user info
            // Requires authentication middleware to be applied

            const authRequest = req as any;
            const user = authRequest.user;

            if (!user) {
                return res.status(401).json({
                    error: 'Unauthorized',
                    code: 'NO_USER'
                });
            }

            const userProfile = await prisma.user.findUnique({
                where: { id: user.id },
                select: {
                    id: true,
                    username: true,
                    role: true,
                    branches: true,
                    createdAt: true,
                    updatedAt: true
                }
            });

            if (!userProfile) {
                return res.status(404).json({
                    error: 'User profile not found',
                    code: 'PROFILE_NOT_FOUND'
                });
            }

            res.json({
                user: userProfile
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new AuthController();