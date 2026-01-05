import nodemailer from 'nodemailer';
import settingsService from '../settings/settings.service';
import exportService from '../exports/export.service';
import settlementService from '../settlements/settlement.service';
import prisma from '../../config/database';

export class EmailService {
    async sendSettlementEmail(settlementId: string) {
        const [settlement, settings] = await Promise.all([
            settlementService.getSettlement(settlementId),
            settingsService.getSettings(),
        ]);

        if (!settings.smtpUser || !settings.smtpPassword) {
            throw new Error('SMTP settings not configured');
        }

        const transporter = nodemailer.createTransport({
            host: settings.smtpHost,
            port: settings.smtpPort,
            secure: settings.smtpPort === 465,
            auth: {
                user: settings.smtpUser,
                pass: settings.smtpPassword,
            },
        });

        const pdfBuffer = await exportService.generateSettlementPDF(settlementId);

        // Parse recipients
        const to = JSON.parse(settings.toEmails);
        const cc = settings.ccEmails ? JSON.parse(settings.ccEmails) : [];

        const body = settings.bodyTemplate
            .replace('{{date}}', settlement.settlementDate.toLocaleDateString())
            .replace('{{amount}}', Number(settlement.netAmount).toLocaleString())
            .replace('{{reference}}', settlement.referenceNumber || '');

        const mailOptions = {
            from: settings.fromEmail || settings.smtpUser,
            to,
            cc,
            subject: settings.subject.replace('{{reference}}', settlement.referenceNumber || ''),
            html: `<div style="direction: rtl; text-align: right; font-family: Arial, sans-serif;">${body}</div>`,
            attachments: [
                {
                    filename: `Settlement-${settlement.referenceNumber}.pdf`,
                    content: pdfBuffer,
                },
            ],
        };

        const info = await transporter.sendMail(mailOptions);

        await prisma.settlement.update({
            where: { id: settlementId },
            data: {
                emailSent: true,
                emailSentAt: new Date(),
                emailRecipients: JSON.stringify({ to, cc }),
            },
        });

        return info;
    }
    async sendBatchReport(batchNumber: string, toEmail?: string) {
        const batches = await settlementService.getSettlementsByBatch();
        const batch = batches.find((b: any) => b.batchNumber === batchNumber);

        if (!batch) throw new Error('Batch not found');

        const settings = await settingsService.getSettings();
        if (!settings.smtpUser || !settings.smtpPassword) {
            throw new Error('SMTP settings not configured');
        }

        const transporter = nodemailer.createTransport({
            host: settings.smtpHost,
            port: settings.smtpPort,
            secure: settings.smtpPort === 465,
            auth: {
                user: settings.smtpUser,
                pass: settings.smtpPassword,
            },
        });

        // Use PDF Service to generate buffer
        const { default: pdfService } = await import('../pdf/pdf.service');
        const pdfBuffer = await pdfService.generateBatchReportBuffer(batch);

        const recipients = toEmail ? [toEmail] : JSON.parse(settings.toEmails);

        const mailOptions = {
            from: settings.fromEmail || settings.smtpUser,
            to: recipients,
            subject: `Settlement Report - Batch #${batchNumber}`,
            html: `
                <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right;">
                    <h3>تقرير تسوية باتش رقم #${batchNumber}</h3>
                    <p>السادة الزملاء،</p>
                    <p>مرفق طيه تقرير التسوية الخاص بالباتش المذكور.</p>
                    <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>التاريخ:</strong> ${new Date(batch.settlementDate).toLocaleDateString('ar-EG')}</p>
                        <p><strong>عدد المعاملات:</strong> ${batch.transactions.length}</p>
                        <p><strong>إجمالي المبلغ:</strong> ${batch.totalAmount.toLocaleString()} ج.م</p>
                    </div>
                </div>
            `,
            attachments: [
                {
                    filename: `Batch_${batchNumber}_Report.pdf`,
                    content: pdfBuffer,
                },
            ],
        };

        const info = await transporter.sendMail(mailOptions);

        // Update batch status if needed (optional)

        return info;
    }
}

export default new EmailService();
