
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
const envPath = path.join(__dirname, '../.env');
console.log(`Loading env from: ${envPath}`);
dotenv.config({ path: envPath });

const prisma = new PrismaClient();

async function main() {
    console.log('Connecting to database...');
    await prisma.$connect();
    console.log('Connected.');

    const username = 'admin';
    const password = 'password123';
    console.log(`Hashing password...`);
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log(`Checking if user '${username}' exists...`);
    const existingUser = await prisma.user.findUnique({
        where: { username }
    });

    if (existingUser) {
        console.log(`User found (ID: ${existingUser.id}). Updating password and role...`);
        const updated = await prisma.user.update({
            where: { id: existingUser.id },
            data: {
                password: hashedPassword,
                role: 'ADMIN'
            }
        });
        console.log('✅ User updated successfully:', updated.username);
    } else {
        console.log(`User not found. Creating new user...`);
        const created = await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                role: 'ADMIN'
            }
        });
        console.log('✅ User created successfully:', created.username);
    }
}

main()
    .catch(e => {
        console.error('❌ Script failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
