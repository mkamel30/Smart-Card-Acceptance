import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
dotenv.config();

import { prisma } from './config/database';

const app = express();
const port = process.env.PORT || 3000;

// Rate limiting configuration
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Security middleware
app.use(limiter);
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// CORS configuration - specific origins only
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];
app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-password', 'selectedbranchid']
}));

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
import settlementRoutes from './modules/settlements/settlement.routes';
import receiptRoutes from './modules/receipts/receipt.routes';
import exportRoutes from './modules/exports/export.routes';
import settingsRoutes from './modules/settings/settings.routes';
import ocrRoutes from './modules/ocr/ocr.routes';
import pdfRoutes from './modules/pdf/pdf.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import authRoutes from './modules/auth/auth.routes';
import branchRoutes from './modules/branches/branch.routes';
import { errorHandler } from './middleware/errorHandler';

// API Routes
app.use('/api/branches', branchRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/uploads', express.static('uploads'));

// Basic health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

app.get('/api/info', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    res.json({ ip, userAgent });
});

import path from 'path';
import fs from 'fs';

// Serve Static Frontend Files
const frontendPath = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
}

// Root Health Check (Important for Render)
app.get('/', (_req, res) => {
    res.status(200).json({ status: 'active', message: 'Card Settlement API is running' });
});

// Handle React Routing, return all requests to React app
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
        return next();
    }

    const indexPath = path.join(frontendPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }

    res.status(404).json({ message: 'Frontend not found or API route not accepted' });
});

// Error Handling
app.use(errorHandler);

const start = async () => {
    try {
        // Validate required environment variables
        if (!process.env.JWT_SECRET) {
            console.error('FATAL: JWT_SECRET is not set. This is required for production.');
            process.exit(1);
        }
        if (!process.env.ADMIN_PASSWORD) {
            console.warn('WARNING: ADMIN_PASSWORD is not set. Please set it for production.');
        }

        await prisma.$connect();
        console.log('Database connected successfully');

        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
            console.log(`CORS origins allowed: ${allowedOrigins.join(', ')}`);
        });
    } catch (error) {
        console.error('Error starting server:', error);
        console.log('Please check your database connection in .env');
        process.exit(1);
    }
}

start();