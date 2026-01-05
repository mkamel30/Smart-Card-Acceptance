import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
export const prisma = new PrismaClient();
const port = process.env.PORT || 3000;

import settlementRoutes from './modules/settlements/settlement.routes';
import receiptRoutes from './modules/receipts/receipt.routes';
import exportRoutes from './modules/exports/export.routes';
import settingsRoutes from './modules/settings/settings.routes';
import emailRoutes from './modules/email/email.routes';
import ocrRoutes from './modules/ocr/ocr.routes';
import pdfRoutes from './modules/pdf/pdf.routes';
import { errorHandler } from './middleware/errorHandler';

app.use(cors({
    origin: true, // Allow all origins that matched origin
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-password', 'selectedbranchid']
}));
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(express.json());

// Routes
import branchRoutes from './modules/branches/branch.routes';

// ...
app.use('/api/branches', branchRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/uploads', express.static('uploads'));

// Basic health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

import path from 'path';
import fs from 'fs';

// Serve Static Frontend Files
const frontendPath = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
}

// API Routes (Ensure these are defined)

// Root Health Check (Important for Render)
app.get('/', (_req, res) => {
    res.status(200).json({ status: 'active', message: 'Card Settlement API is running' });
});

// Handle React Routing, return all requests to React app
// Place this AFTER API routes so API requests aren't intercepted
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
        return next();
    }

    // If frontend is built and available, serve index.html
    const indexPath = path.join(frontendPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }

    // Otherwise return 404 (Backend-only mode)
    res.status(404).json({ message: 'Frontend not found or API route not accepted' });
});

// Error Handling
app.use(errorHandler);

const start = async () => {
    try {
        // Attempt to connect to DB, but don't hard crash if it fails immediately in dev
        // so that the server can at least start for other checks if needed.
        // However, for this app, DB is critical.
        await prisma.$connect();
        console.log('Database connected successfully');

        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    } catch (error) {
        console.error('Error starting server:', error);
        console.log('Please check your database connection in .env');
        // process.exit(1); 
    }
}

start();
