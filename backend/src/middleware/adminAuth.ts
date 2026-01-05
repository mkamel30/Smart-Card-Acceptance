import { Request, Response, NextFunction } from 'express';

export const adminAuth = (req: Request, res: Response, next: NextFunction) => {
    const adminPassword = req.headers['x-admin-password'] || req.body.adminPassword;

    if (adminPassword === 'TITI') {
        return next();
    }

    return res.status(401).json({ error: 'Unauthorized: Incorrect Admin Password' });
};
