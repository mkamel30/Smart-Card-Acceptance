import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
    const username = 'admin';
    const password = 'password123';
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.upsert({
        where: { username },
        update: {
            password: hashedPassword,
            role: 'ADMIN'
        },
        create: {
            username,
            password: hashedPassword,
            role: 'ADMIN'
        }
    });

    console.log(`User ${user.username} created/updated with password: ${password}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
