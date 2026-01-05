
import { Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export class AuthController {
    async login(req: Request, res: Response, next: NextFunction) {
        try {
            const { username, password } = req.body;
            const user = await prisma.user.findUnique({
                where: { username },
                include: { branches: true }
            });

            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
            }

            const token = jwt.sign(
                {
                    id: user.id,
                    role: user.role,
                    allowedBranches: user.branches.map(b => b.id)
                },
                process.env.JWT_SECRET || 'secret',
                { expiresIn: '1d' }
            );

            res.json({
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    branches: user.branches
                }
            });
        } catch (error) {
            next(error);
        }
    }

    async setupInitialAdmin(req: Request, res: Response, next: NextFunction) {
        try {
            // const { secret } = req.body;
            // if (secret !== process.env.ADMIN_PASSWORD) {
            //     return res.status(403).json({ error: 'Forbidden' });
            // }

            const existing = await prisma.user.findUnique({ where: { username: 'admin' } });
            if (existing) return res.json({ message: 'Admin already exists' });

            const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
            await prisma.user.create({
                data: {
                    username: 'admin',
                    password: hashed,
                    role: 'ADMIN'
                }
            });

            res.json({ message: 'Initial admin created' });
        } catch (error) {
            next(error);
        }
    }
}

export default new AuthController();
