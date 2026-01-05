import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding Branches...');

    const branches = [
        { name: 'القاهرة - الجيش', code: 'CAIRO_ELGEISH' },
        { name: 'الجيزة', code: 'GIZA' },
        { name: 'حلوان', code: 'HELWAN' }
    ];

    for (const branch of branches) {
        const existing = await prisma.branch.findUnique({
            where: { name: branch.name }
        });

        if (!existing) {
            await prisma.branch.create({
                data: branch
            });
            console.log(`Created branch: ${branch.name}`);
        } else {
            console.log(`Branch exists: ${branch.name}`);
        }
    }

    console.log('Seeding completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
