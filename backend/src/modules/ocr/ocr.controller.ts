import { Request, Response, NextFunction } from 'express';
import ocrService from './ocr.service';
import fs from 'fs';

export class OCRController {
    async scan(req: Request, res: Response, next: NextFunction) {
        try {
            const file = req.file;
            if (!file) {
                return res.status(400).json({ message: 'No file uploaded' });
            }

            const result = await ocrService.extractAndParse(file);

            // Delete the temporary file after processing
            try {
                fs.unlinkSync(file.path);
            } catch (e) {
                // Ignore cleanup errors
            }

            res.status(200).json({
                success: true,
                data: result.data,
                rawText: result.rawText
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new OCRController();
