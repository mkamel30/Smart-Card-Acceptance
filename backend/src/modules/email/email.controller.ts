import { Request, Response, NextFunction } from 'express';
import emailService from './email.service';

export class EmailController {
    async send(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const result = await emailService.sendSettlementEmail(id);
            res.json({ message: 'Email sent successfully', result });
        } catch (error) {
            next(error);
        }
    }
    async sendBatch(req: Request, res: Response, next: NextFunction) {
        try {
            const { batchNumber } = req.params;
            const { toEmail } = req.body;
            const result = await emailService.sendBatchReport(batchNumber, toEmail);
            res.json({ message: 'Email sent successfully', result });
        } catch (error) {
            next(error);
        }
    }
}

export default new EmailController();
