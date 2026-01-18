import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export const errorHandler = (
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction
) => {
    console.error(err);

    if (err instanceof ZodError) {
        return res.status(400).json({
            message: 'Validation error',
            errors: err.errors,
        });
    }

    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';

    res.status(status).json({
        message,
    });
};
