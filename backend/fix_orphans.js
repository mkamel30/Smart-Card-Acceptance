
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const branches = await prisma.branch.findMany();
    console.log('Branches:', JSON.stringify(branches, null, 2));

    const orphans = await prisma.settlement.count({
        where: { branchId: null }
    });
    console.log('Orphan Settlements:', orphans);

    if (orphans > 0 && branches.length > 0) {
        const firstBranchId = branches[0].id;
        console.log(`Fixing ${orphans} orphans to branch ${firstBranchId}...`);
        const result = await prisma.settlement.updateMany({
            where: { branchId: null },
            data: { branchId: firstBranchId }
        });
        console.log('Update result:', result);
    }
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
