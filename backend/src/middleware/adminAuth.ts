import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

const getJwtSecret = (): string => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET environment variable is required');
    }
    return secret;
};

// Rate limiting specifically for admin operations
const adminRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // limit each IP to 50 admin requests per windowMs (prevent blocking legitimate admin work)
    message: 'Too many admin attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

export interface AuthRequest extends Request {
    user?: {
        id: string;
        role: string;
        allowedBranches: string[];
    };
}

export const adminAuth = (req: Request, res: Response, next: NextFunction) => {
    try {
        // Check for JWT token in Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({
                error: 'Unauthorized: Authorization header required',
                code: 'NO_AUTH_HEADER'
            });
        }

        const token = authHeader.split(' ')[1]; // Bearer <token>
        if (!token) {
            return res.status(401).json({
                error: 'Unauthorized: Token format invalid',
                code: 'INVALID_TOKEN_FORMAT'
            });
        }

        // Verify JWT token
        const decoded = jwt.verify(token, getJwtSecret()) as any;

        // Check if user has admin role
        if (decoded.role !== 'ADMIN') {
            return res.status(403).json({
                error: 'Forbidden: Admin access required',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }

        // Attach user info to request
        (req as AuthRequest).user = decoded;
        next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({
                error: 'Unauthorized: Invalid token',
                code: 'INVALID_TOKEN'
            });
        }
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({
                error: 'Unauthorized: Token expired',
                code: 'TOKEN_EXPIRED'
            });
        }
        console.error('Admin auth error:', error);
        return res.status(500).json({
            error: 'Internal server error during authentication',
            code: 'AUTH_ERROR'
        });
    }
};

// Legacy admin password authentication for backward compatibility during transition
// Will be removed after migration period
export const legacyAdminAuth = (req: Request, res: Response, next: NextFunction) => {
    const adminPassword = req.headers['x-admin-password'] || req.body.adminPassword || req.query.password;

    if (!adminPassword) {
        return res.status(401).json({
            error: 'Unauthorized: Admin password required',
            code: 'NO_PASSWORD',
            deprecationWarning: 'This authentication method is deprecated. Please use JWT authentication.'
        });
    }

    if (adminPassword === process.env.ADMIN_PASSWORD) {
        return next();
    }

    return res.status(401).json({
        error: 'Unauthorized: Incorrect Admin Password',
        code: 'INVALID_PASSWORD',
        deprecationWarning: 'This authentication method is deprecated. Please use JWT authentication.'
    });
};

// Combined authentication middleware (supports both JWT and Legacy Password)
export const unifiedAdminAuth = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const adminPassword = req.headers['x-admin-password'] || req.body.adminPassword || req.query.password;

    // 1. Try JWT first if header exists
    if (authHeader) {
        return adminAuth(req, res, next);
    }

    // 2. Fallback to legacy password
    if (adminPassword) {
        return legacyAdminAuth(req, res, next);
    }

    // 3. Neither provided
    return res.status(401).json({
        error: 'Unauthorized: Authentication required',
        code: 'AUTH_REQUIRED',
        message: 'Please provide either a valid JWT token or admin password'
    });
};

// Apply rate limiting to admin auth
export const adminAuthWithRateLimit = [adminRateLimit, adminAuth];
export const legacyAdminAuthWithRateLimit = [adminRateLimit, legacyAdminAuth];
export const unifiedAdminAuthWithRateLimit = [adminRateLimit, unifiedAdminAuth];