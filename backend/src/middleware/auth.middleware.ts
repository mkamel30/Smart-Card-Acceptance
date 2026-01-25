import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const getJwtSecret = (): string => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET environment variable is required');
    }
    return secret;
};

export interface AuthRequest extends Request {
    user?: {
        id: string;
        role: string;
        allowedBranches: string[];
    };
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
    // Check for JWT Token only (removed legacy admin password support)
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({
            error: 'No token provided',
            code: 'NO_AUTH_HEADER'
        });
    }

    const token = authHeader.split(' ')[1]; // Bearer <token>
    if (!token) {
        return res.status(401).json({
            error: 'Invalid token format',
            code: 'INVALID_TOKEN_FORMAT'
        });
    }

    try {
        const decoded = jwt.verify(token, getJwtSecret()) as any;
        (req as AuthRequest).user = decoded;
        next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({
                error: 'Token expired',
                code: 'TOKEN_EXPIRED'
            });
        }
        console.error('Authentication error:', error);
        return res.status(500).json({
            error: 'Internal server error during authentication',
            code: 'AUTH_ERROR'
        });
    }
};

export const optionalAuthenticate = (req: Request, _res: Response, next: NextFunction) => {
    // Check for JWT Token only (removed legacy admin password support)
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, getJwtSecret()) as any;
            (req as AuthRequest).user = decoded;
        } catch (error) {
            // If token is invalid, we'll proceed as guest but log it
            console.error('Invalid token in optional auth:', error instanceof Error ? error.message : 'Unknown error');
        }
    }
    next();
};

export const requireBranchAccess = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthRequest).user;
    if (!user) {
        return res.status(401).json({
            error: 'Unauthorized',
            code: 'NO_USER'
        });
    }

    if (user.role === 'ADMIN') {
        return next();
    }

    // For branch managers, we'll check specific branch access in controllers
    // This allows more flexible branch filtering logic
    next();
};

// Role-based access control helpers
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthRequest).user;
    if (!user || user.role !== 'ADMIN') {
        return res.status(403).json({
            error: 'Forbidden: Admin access required',
            code: 'ADMIN_REQUIRED'
        });
    }
    next();
};

export const requireBranchManager = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthRequest).user;
    if (!user || (user.role !== 'BRANCH_MANAGER' && user.role !== 'ADMIN')) {
        return res.status(403).json({
            error: 'Forbidden: Branch manager access required',
            code: 'BRANCH_MANAGER_REQUIRED'
        });
    }
    next();
};

// Middleware to check if user has access to specific branch
export const requireBranchAccessTo = (branchId: string) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as AuthRequest).user;
        if (!user) {
            return res.status(401).json({
                error: 'Unauthorized',
                code: 'NO_USER'
            });
        }

        if (user.role === 'ADMIN') {
            return next();
        }

        if (user.role === 'BRANCH_MANAGER') {
            if (user.allowedBranches.includes(branchId)) {
                return next();
            }
            return res.status(403).json({
                error: 'Forbidden: No access to this branch',
                code: 'BRANCH_ACCESS_DENIED'
            });
        }

        return res.status(403).json({
            error: 'Forbidden: Invalid user role',
            code: 'INVALID_ROLE'
        });
    };
};