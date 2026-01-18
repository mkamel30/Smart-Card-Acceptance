
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const total = await prisma.settlement.count();
    const withBranch = await prisma.settlement.count({ where: { NOT: { branchId: null } } });
    const branches = await prisma.branch.findMany();

    console.log(`Total Settlements: ${total}`);
    console.log(`Settlements with Branch: ${withBranch}`);
    console.log(`Available Branches:`, branches);

    const sample = await prisma.settlement.findMany({ take: 5 });
    console.log(`Sample Settlements Branch IDs:`, sample.map(s => s.branchId));
}

main().catch(console.error).finally(() => prisma.$disconnect());
