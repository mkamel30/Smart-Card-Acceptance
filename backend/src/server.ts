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

app.use(helmet());
app.use(cors());
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
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

import path from 'path';

// Serve Static Frontend Files
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// API Routes (Ensure these are defined)

// Handle React Routing, return all requests to React app
// Place this AFTER API routes so API requests aren't intercepted
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
        return next();
    }
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
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
