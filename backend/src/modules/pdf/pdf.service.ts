import PDFDocument from 'pdfkit';
import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import ArabicReshaper from 'arabic-reshaper';

interface BatchData {
    batchNumber: string;
    settlementDate: Date;
    transactions: any[];
    totalAmount: number;
}

export class PDFService {
    private logoPath: string;
    private fontPath: string;

    constructor() {
        this.logoPath = path.join(__dirname, '../../../uploads/logo.png');
        // Try to locate a system font or fallback
        this.fontPath = 'c:/Windows/Fonts/arial.ttf';
        if (!fs.existsSync(this.fontPath)) {
            // Fallback for non-windows envs (though user is on windows)
            this.fontPath = 'Helvetica';
        }
    }

    private processArabic(text: string): string {
        if (!text) return '';
        try {
            // Check if text contains Arabic characters
            const hasArabic = /[\u0600-\u06FF]/.test(text);
            if (!hasArabic) return text;

            // Reshape Arabic letters (connect them)
            const reshaped = ArabicReshaper.convertArabic(text);

            // Reverse for RTL rendering in LTR context
            return reshaped.split('').reverse().join('');
        } catch (e) {
            return text;
        }
    }

    async generateBatchReport(batch: BatchData, res: Response) {
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            info: {
                Title: `تقرير تسوية - باتش ${batch.batchNumber}`,
                Author: 'نظام تسوية سمارت',
            }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=batch_${batch.batchNumber}_report.pdf`);
        doc.pipe(res);

        this.renderPDFContent(doc, batch);
        doc.end();
    }

    async generateBatchReportBuffer(batch: BatchData): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const chunks: Buffer[] = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            this.renderPDFContent(doc, batch);
            doc.end();
        });
    }

    private renderPDFContent(doc: PDFKit.PDFDocument, batch: BatchData) {
        const isArial = this.fontPath.toLowerCase().includes('arial');
        if (isArial) doc.font(this.fontPath);

        // Header with logo
        if (fs.existsSync(this.logoPath)) {
            doc.image(this.logoPath, 500, 45, { width: 45 }); // Logo on right for RTL? No, usually top left or right. Let's put right.
        }

        // Title (Center/Right)
        doc.fontSize(20)
            .fillColor('#1e40af')
            .text(this.processArabic('تقرير تسوية الباتش'), 50, 60, { align: 'center', width: 500 });

        doc.fontSize(12)
            .fillColor('#666')
            .text(`Batch #${batch.batchNumber}`, 50, 90, { align: 'center' });

        // Line
        doc.moveTo(50, 120).lineTo(545, 120).strokeColor('#e5e7eb').stroke();

        // Summary Box
        doc.roundedRect(50, 140, 495, 80, 8).fillColor('#f9fafb').fill();

        const summaryX_Label = 450;
        const summaryX_Value = 300;

        doc.fillColor('#374151').fontSize(12);

        // Date
        doc.text(this.processArabic('التاريخ:'), summaryX_Label, 155, { align: 'right', width: 80 });
        doc.font(isArial ? this.fontPath : 'Helvetica-Bold').text(new Date(batch.settlementDate).toLocaleDateString('ar-EG'), summaryX_Value, 155, { align: 'right', width: 140 });

        if (isArial) doc.font(this.fontPath); // Reset font

        // Transactions Count
        doc.text(this.processArabic('عدد المعاملات:'), summaryX_Label, 175, { align: 'right', width: 80 });
        doc.text(String(batch.transactions.length), summaryX_Value, 175, { align: 'right', width: 140 });

        // Total Amount
        doc.text(this.processArabic('الإجمالي:'), summaryX_Label, 195, { align: 'right', width: 80 });
        doc.fillColor('#1e40af').font(isArial ? this.fontPath : 'Helvetica-Bold')
            .text(`${batch.totalAmount.toLocaleString()} EGP`, summaryX_Value, 195, { align: 'right', width: 140 });

        // Status Badge (Left side)
        doc.roundedRect(50, 160, 100, 30, 5).fillColor('#22c55e').fill();
        doc.fillColor('#fff').fontSize(12)
            .text(this.processArabic('تمت التسوية'), 50, 168, { width: 100, align: 'center' });

        // Table Header
        const tableTop = 250;
        if (isArial) doc.font(this.fontPath);
        doc.fillColor('#1e40af').fontSize(10);

        // Columns (RTL: Start from Right)
        // # | Merchant Code | Merchant Name | Card Info | Approval | Amount
        const colAmount = 50;   // Leftmost
        const colApprov = 120;
        const colCard = 190;
        const colName = 290;
        const colCode = 450;
        const colHash = 520;    // Rightmost

        doc.text(this.processArabic('م'), colHash, tableTop, { width: 20, align: 'center' });
        doc.text(this.processArabic('كود التاجر'), colCode, tableTop, { width: 60, align: 'right' });
        doc.text(this.processArabic('اسم التاجر'), colName, tableTop, { width: 150, align: 'right' });
        doc.text(this.processArabic('بيانات الكارت'), colCard, tableTop, { width: 90, align: 'right' });
        doc.text(this.processArabic('الموافقة'), colApprov, tableTop, { width: 60, align: 'right' });
        doc.text(this.processArabic('المبلغ الصافي'), colAmount, tableTop, { width: 65, align: 'right' });

        doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).strokeColor('#1e40af').stroke();

        let y = tableTop + 25;
        doc.fillColor('#374151').fontSize(9);

        batch.transactions.forEach((t, i) => {
            if (y > 750) {
                doc.addPage();
                y = 50;
            }

            if (i % 2 === 0) doc.rect(50, y - 5, 495, 20).fillColor('#f9fafb').fill();
            doc.fillColor('#374151');

            const cardInfo = `${t.cardBin || '******'} **** ${t.last4Digits || '0000'}`;

            doc.text(String(i + 1), colHash, y, { width: 20, align: 'center' });
            doc.text(t.merchantCode || '-', colCode, y, { width: 60, align: 'right' });
            doc.text(this.processArabic(t.merchantName || '-'), colName, y, { width: 150, align: 'right' });
            doc.text(cardInfo, colCard, y, { width: 90, align: 'right' });
            doc.text(t.approvalNumber || '-', colApprov, y, { width: 60, align: 'right' });
            doc.text(Number(t.settledAmount).toLocaleString(), colAmount, y, { width: 65, align: 'right' });

            y += 20;
        });

        // Footer
        doc.fontSize(8).fillColor('#9ca3af')
            .text(this.processArabic('تم استخراج هذا التقرير آلياً من نظام تسوية قبول البطاقات الإلكترونية - شركة سمارت'), 50, 780, { align: 'center', width: 495 });
    }
}

export default new PDFService();
