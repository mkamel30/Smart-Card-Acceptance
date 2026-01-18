
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Starting category fix...');

    // Update SMART category for things that look like SMART (actually they are already SMART by default)

    // Update TAMWEEN category for specific sub-services
    const tamweenUpdate = await prisma.settlement.updateMany({
        where: {
            OR: [
                { subService: { contains: 'فروق' } },
                { subService: { contains: 'غرامات' } },
                { subService: { contains: 'الغرامات' } }
            ]
        },
        data: {
            serviceCategory: 'TAMWEEN'
        }
    });

    console.log(`Updated ${tamweenUpdate.count} settlements to TAMWEEN category.`);

    // Fix case where some might be NULL (though schema has default)
    const smartUpdate = await prisma.settlement.updateMany({
        where: {
            serviceCategory: { not: 'TAMWEEN' }
        },
        data: {
            serviceCategory: 'SMART'
        }
    });

    console.log(`Ensured ${smartUpdate.count} settlements are set to SMART category.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
