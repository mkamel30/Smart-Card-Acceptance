import fs from 'fs';
import path from 'path';
import prisma from '../config/database';

export async function createBackup() {
    console.log('[Backup] Starting database backup...');
    try {
        const settlements = await prisma.settlement.findMany({
            include: { receipt: true }
        });

        const backupDir = path.join(process.cwd(), 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir);
        }

        const filename = `backup_settlements_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const filePath = path.join(backupDir, filename);

        fs.writeFileSync(filePath, JSON.stringify(settlements, null, 2));

        console.log(`[Backup] Success! File saved to: ${filePath}`);
        return filePath;
    } catch (error) {
        console.error('[Backup] Failed to create backup:', error);
        throw error;
    }
}
