import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import http from 'http';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPA_PROJECT_URL || "https://nuaslolzzocyciuobyrd.supabase.co";
const supabaseServiceKey = process.env.SUPA_SERVICE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51YXNsb2x6em9jeWNpdW9ieXJkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzU2MDY0NiwiZXhwIjoyMDgzMTM2NjQ2fQ.cxs28GJO-dbF3LBvXB1X-k2ZEMr3prniWDj8uOyOYSE";

// Ensure backups directory exists
const backupDir = path.resolve(__dirname, '../../backups');
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

// Format timestamp for filename
const now = new Date();
const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
const filename = `database_backup_${timestamp}.json`;
const targetFilePath = path.join(backupDir, filename);
const latestFilePath = path.join(backupDir, 'latest_backup.json');

// Force IPv4 agent to avoid Windows Node.js IPv6 DNS resolution issues
const httpsAgent = new https.Agent({ family: 4, keepAlive: true });

const apiClient = axios.create({
    baseURL: `${supabaseUrl}/rest/v1`,
    headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Prefer': 'count=exact'
    },
    httpsAgent,
    timeout: 15000
});

async function exportBackup() {
    try {
        console.log('🔄 جاري الاتصال بقاعدة البيانات عبر Supabase REST API...');

        const tables = [
            'Branch',
            'User',
            '_UserBranches',
            'Settlement',
            'Receipt',
            'EmailSetting',
            'AuditLog'
        ];

        const backupData = {
            metadata: {
                exportedAt: now.toISOString(),
                source: supabaseUrl,
                totalTables: tables.length,
                tablesSummary: {}
            },
            data: {}
        };

        for (const tableName of tables) {
            try {
                const response = await apiClient.get(`/${tableName}?select=*&limit=100000`);
                const rows = response.data || [];
                backupData.data[tableName] = rows;
                backupData.metadata.tablesSummary[tableName] = rows.length;
                console.log(`- جدول "${tableName}": تم حفظ ${rows.length} سجل.`);
            } catch (tableError) {
                console.warn(`- تنبيه: تعذر جلب جدول "${tableName}" (${tableError.message})`);
                backupData.data[tableName] = [];
                backupData.metadata.tablesSummary[tableName] = 0;
            }
        }

        // Write to JSON files
        const jsonContent = JSON.stringify(backupData, null, 2);
        fs.writeFileSync(targetFilePath, jsonContent, 'utf-8');
        fs.writeFileSync(latestFilePath, jsonContent, 'utf-8');

        const fileSizeKB = (Buffer.byteLength(jsonContent, 'utf-8') / 1024).toFixed(2);

        console.log('\n======================================================');
        console.log('🎉 تم إنشاء النسخة الاحتياطية بنجاح!');
        console.log(`📁 المسار: ${targetFilePath}`);
        console.log(`📊 الحجم: ${fileSizeKB} KB`);
        console.log('======================================================\n');

        return {
            path: targetFilePath,
            summary: backupData.metadata.tablesSummary,
            sizeKB: fileSizeKB
        };
    } catch (error) {
        console.error('❌ خطأ أثناء عمل النسخة الاحتياطية:', error.message);
        throw error;
    }
}

exportBackup();
