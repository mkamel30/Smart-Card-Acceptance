import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import prisma from '../../config/database';
import fs from 'fs';
import path from 'path';
import { SettlementWithReceipt } from '../../common/types';

// Service for generating Excel and PDF exports
export class ExportService {
    async exportToExcel(filters: any = {}): Promise<Buffer> {
        const settlements = (await prisma.settlement.findMany({
            where: filters,
            include: { receipt: true },
            orderBy: { settlementDate: 'desc' },
        })) as unknown as SettlementWithReceipt[];

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Settlements');

        sheet.columns = [
            { header: 'م', key: 'index', width: 5 },
            { header: 'التاريخ', key: 'settlementDate', width: 15 },
            { header: 'رقم المخبز/التاجر', key: 'merchantCode', width: 20 },
            { header: 'اسم المخبز/التاجر', key: 'merchantName', width: 25 },
            { header: 'نوع الخدمة', key: 'subService', width: 15 },
            { header: 'المبلغ المسدد', key: 'settledAmount', width: 15 },
            { header: 'العمولة (1.15%)', key: 'fees', width: 15 },
            { header: 'المبلغ الصافي', key: 'netAmount', width: 15 },
            { header: 'رقم الموافقة', key: 'approvalNumber', width: 15 },
            { header: 'رقم الباتش', key: 'batchNumber', width: 15 },
            { header: 'أول 6 أرقام (BIN)', key: 'cardBin', width: 15 },
            { header: 'آخر 4 أرقام', key: 'last4Digits', width: 15 },
        ];

        settlements.forEach((s, i) => {
            sheet.addRow({
                index: i + 1,
                settlementDate: s.settlementDate.toLocaleDateString('ar-EG'),
                merchantCode: s.merchantCode,
                merchantName: s.receipt?.merchantName || s.merchantName || '',
                subService: s.subService || s.serviceCategory,
                settledAmount: Number(s.settledAmount),
                fees: Number(s.fees),
                netAmount: Number(s.netAmount),
                approvalNumber: s.approvalNumber || '',
                batchNumber: s.batchNumber || '',
                cardBin: s.cardBin || '',
                last4Digits: s.last4Digits || '',
            });
        });

        // RTL formatting
        sheet.views = [{ rightToLeft: true }];

        return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    }

    async generateSettlementPDF(id: string): Promise<Buffer> {
        const settlement = (await prisma.settlement.findUnique({
            where: { id },
            include: { receipt: true },
        })) as SettlementWithReceipt;

        if (!settlement) throw new Error('Settlement not found');

        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ margin: 50 });
            const chunks: Buffer[] = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // PDF Content mimicking the document slip
            doc.fontSize(16).text('نموذج استلام مبالغ سداد كبونات / بطاقات', { align: 'center' });
            doc.moveDown();

            doc.fontSize(12);
            doc.text(`نوع الخدمة: ${settlement.subService || settlement.serviceCategory}`, { align: 'right' });
            doc.text(`كود (المخبز / التاجر): ${settlement.merchantCode}`, { align: 'right' });
            doc.text(`صافي مبلغ الخدمة: ${Number(settlement.netAmount).toLocaleString()} ج.م`, { align: 'right' });
            doc.text(`الاسم: ${settlement.customerName || 'N/A'}`, { align: 'right' });
            doc.text(`رقم هاتف العميل: ${settlement.customerPhone || 'N/A'}`, { align: 'right' });
            doc.text(`التاريخ: ${settlement.settlementDate.toLocaleDateString('ar-EG')}`, { align: 'right' });

            doc.moveDown();
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown();

            doc.text('صورة الإيصال:', { align: 'center' });
            doc.moveDown();

            if (settlement.receipt?.imageUrl) {
                try {
                    const fullPath = path.resolve(settlement.receipt.imageUrl);
                    if (fs.existsSync(fullPath)) {
                        doc.image(fullPath, {
                            fit: [450, 600],
                            align: 'center'
                        });
                    }
                } catch (err) {
                    doc.text('Image not found');
                }
            }

            doc.end();
        });
    }

    async generateBatchExcel(batch: any): Promise<Buffer> {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(`Batch ${batch.batchNumber}`);

        // Styles
        const headerFont = { name: 'Arial', bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
        const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };

        sheet.views = [{ rightToLeft: true }];

        // Batch Info
        sheet.mergeCells('A1:F1');
        sheet.getCell('A1').value = `تقرير تسوية باتش رقم ${batch.batchNumber}`;
        sheet.getCell('A1').font = { size: 16, bold: true };
        sheet.getCell('A1').alignment = { horizontal: 'center' };

        sheet.getCell('A3').value = 'تاريخ التسوية:';
        sheet.getCell('B3').value = new Date(batch.settlementDate).toLocaleDateString('ar-EG');

        sheet.getCell('C3').value = 'عدد المعاملات:';
        sheet.getCell('D3').value = batch.transactions.length;

        sheet.getCell('E3').value = 'الإجمالي:';
        sheet.getCell('F3').value = batch.totalAmount;
        sheet.getCell('F3').numFmt = '#,##0.00 "ج.م"';

        // Table Header
        const headers = ['م', 'كود التاجر', 'اسم التاجر', 'أول 6 أرقام (BIN)', 'آخر 4 أرقام', 'رقم الموافقة', 'المبلغ المسدد', 'العمولة', 'المبلغ الصافي'];
        const headerRow = sheet.getRow(6);
        headers.forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            cell.font = headerFont;
            cell.fill = headerFill as any;
            cell.alignment = { horizontal: 'center' };
        });

        // Data
        batch.transactions.forEach((t: any, i: number) => {
            const row = sheet.getRow(7 + i);
            row.getCell(1).value = i + 1;
            row.getCell(2).value = t.merchantCode || '';
            row.getCell(3).value = t.merchantName || t.receipt?.merchantName || '';
            row.getCell(4).value = t.cardBin || '';
            row.getCell(5).value = t.last4Digits || '';
            row.getCell(6).value = t.approvalNumber || '';
            row.getCell(7).value = Number(t.settledAmount);
            row.getCell(8).value = Number(t.fees);
            row.getCell(9).value = Number(t.netAmount);
            row.getCell(7).numFmt = '#,##0.00';
            row.getCell(8).numFmt = '#,##0.00';
            row.getCell(9).numFmt = '#,##0.00';

            row.eachCell((cell) => {
                cell.alignment = { horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });

        // Column widths
        sheet.columns = [
            { width: 5 }, { width: 15 }, { width: 30 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 20 }
        ];

        return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    }
}

export default new ExportService();
