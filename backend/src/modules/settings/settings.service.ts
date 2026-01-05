import prisma from '../../config/database';

export class SettingsService {
    async getSettings() {
        let settings = await prisma.emailSetting.findFirst();
        if (!settings) {
            settings = await prisma.emailSetting.create({
                data: {
                    toEmails: JSON.stringify([]),
                    subject: 'Card Settlement Report',
                    bodyTemplate: '<p>Attached is the settlement report for {{date}}.</p><p>Amount: {{amount}} {{reference}}</p>',
                    smtpHost: 'smtp.gmail.com',
                    smtpPort: 587,
                    smtpUser: '',
                    smtpPassword: '',
                    fromEmail: '',
                }
            });
        }
        return settings;
    }

    async updateSettings(data: any) {
        const existing = await this.getSettings();
        return await prisma.emailSetting.update({
            where: { id: existing.id },
            data: {
                toEmails: JSON.stringify(data.toEmails || []),
                ccEmails: JSON.stringify(data.ccEmails || []),
                bccEmails: JSON.stringify(data.bccEmails || []),
                subject: data.subject,
                bodyTemplate: data.bodyTemplate,
                smtpHost: data.smtpHost,
                smtpPort: Number(data.smtpPort),
                smtpUser: data.smtpUser,
                smtpPassword: data.smtpPassword, // Should ideally be encrypted
                fromEmail: data.fromEmail,
                autoSendOnApprove: !!data.autoSendOnApprove,
                includeReceiptPDF: !!data.includeReceiptPDF,
                includeExcel: !!data.includeExcel,
            },
        });
    }
}

export default new SettingsService();
