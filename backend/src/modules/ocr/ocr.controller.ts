import { Request, Response, NextFunction } from 'express';
import ocrService from './ocr.service';


// Allowed file types for OCR processing
const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/bmp',
    'image/tiff'
];

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;



export class OCRController {
    async scan(req: Request, res: Response, next: NextFunction) {
        try {
            const file = req.file;

            // 1. Validate file exists
            if (!file) {
                return res.status(400).json({
                    error: 'No file uploaded',
                    code: 'NO_FILE',
                    message: 'Please upload an image file for OCR processing'
                });
            }

            // 2. Validate file type
            if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
                return res.status(400).json({
                    error: 'Invalid file type',
                    code: 'INVALID_FILE_TYPE',
                    message: 'Only JPEG, PNG, WebP, BMP, and TIFF images are allowed',
                    allowedTypes: ALLOWED_MIME_TYPES
                });
            }

            // 3. Validate file size
            if (file.size > MAX_FILE_SIZE) {
                return res.status(400).json({
                    error: 'File too large',
                    code: 'FILE_TOO_LARGE',
                    message: `Maximum file size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
                    maxSize: MAX_FILE_SIZE,
                    receivedSize: file.size
                });
            }

            // 4. Validate file size is not too small (avoid empty files)
            if (file.size < 1024) { // 1KB minimum
                return res.status(400).json({
                    error: 'File too small',
                    code: 'FILE_TOO_SMALL',
                    message: 'File appears to be empty or corrupted',
                    minSize: 1024,
                    receivedSize: file.size
                });
            }

            // 5. Additional security: Check file header (magic bytes)
            // Using buffer instead of path for cloud compatibility
            const isValidImage = this.validateImageHeader(file.buffer);
            if (!isValidImage) {
                return res.status(400).json({
                    error: 'Invalid image file',
                    code: 'INVALID_IMAGE_HEADER',
                    message: 'File does not appear to be a valid image'
                });
            }

            const result = await ocrService.extractAndParse(file);

            res.status(200).json({
                success: true,
                data: result.data,
                rawText: result.rawText,
                engine: result.engine,
                processingInfo: {
                    originalSize: file.size,
                    originalType: file.mimetype,
                    processingTime: Date.now()
                }
            });
        } catch (error: any) {
            console.error('OCR Controller FATAL Error:', error);
            res.status(500).json({
                error: 'Internal server error during OCR processing',
                message: error.message,
                code: 'OCR_CRASH',
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }

    private validateImageHeader(buffer: Buffer): boolean {
        try {
            if (!buffer || buffer.length === 0) return false;

            // Check common image signatures (magic bytes)
            const signatures = [
                { type: 'jpeg', signature: [0xFF, 0xD8, 0xFF] },
                { type: 'png', signature: [0x89, 0x50, 0x4E, 0x47] },
                { type: 'webp', signature: [0x52, 0x49, 0x46, 0x46] }, // RIFF
                { type: 'bmp', signature: [0x42, 0x4D] }, // BM
                { type: 'tiff', signature: [0x49, 0x49, 0x2A, 0x00] } // II*\\0
            ];

            return signatures.some(sig => {
                if (buffer.length < sig.signature.length) return false;
                return sig.signature.every((byte, index) => buffer[index] === byte);
            });
        } catch (error) {
            console.error('Image header validation error:', error);
            return false;
        }
    }
}

export default new OCRController();