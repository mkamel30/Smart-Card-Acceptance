
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        role: string;
        allowedBranches: string[];
    };
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
    // 1. Check for Legacy Admin Password
    const adminPassword = req.headers['x-admin-password'];
    if (adminPassword && adminPassword === process.env.ADMIN_PASSWORD) {
        (req as AuthRequest).user = {
            id: 'legacy-admin',
            role: 'ADMIN',
            allowedBranches: [] // Admin sees all regardless
        };
        return next();
    }

    // 2. Check for JWT Token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
        (req as AuthRequest).user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

export const requireBranchAccess = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (user.role === 'ADMIN') {
        return next();
    }

    // specific checks can be done here or in the controller
    // for now, we just ensure we have the user info to filter queries
    next();
};
