
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
    const username = 'admin';
    const password = 'password123';

    console.log(`Checking user: ${username}`);
    const user = await prisma.user.findUnique({
        where: { username }
    });

    if (!user) {
        console.error('❌ User not found in database!');
        return;
    }

    console.log('✅ User found.');
    const match = await bcrypt.compare(password, user.password);

    if (match) {
        console.log('✅ Password bcrypt comparison SUCCESS.');
    } else {
        console.error('❌ Password bcrypt comparison FAILED.');
        console.log('Stored Hash:', user.password);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
