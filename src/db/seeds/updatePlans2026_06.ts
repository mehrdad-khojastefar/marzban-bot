import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const GB = 1073741824;

// Plans to deactivate in the fixed group, matched by exact data_limit + price.
const OLD_FIXED_PLANS: { gb: number; price: number }[] = [
  { gb: 5, price: 600000 },
  { gb: 10, price: 1100000 },
];

// New fixed plans to create in the existing fixed group.
const NEW_FIXED_PLANS: { gb: number; price: number }[] = [
  { gb: 20, price: 300000 },
  { gb: 30, price: 450000 },
  { gb: 40, price: 600000 },
  { gb: 50, price: 750000 },
  { gb: 100, price: 1400000 },
];

async function run() {
  const fixedGroup = await prisma.planGroup.findFirst({ where: { type: 'fixed' } });
  if (!fixedGroup) {
    throw new Error('Fixed plan group not found. Run `yarn db:seed` first.');
  }
  console.log(`Fixed group: id=${String(fixedGroup.id)} code=${fixedGroup.code}`);

  // 1) Deactivate the old fixed plans (match by exact data_limit + price).
  for (const old of OLD_FIXED_PLANS) {
    const result = await prisma.plan.updateMany({
      where: {
        group_id: fixedGroup.id,
        data_limit: BigInt(old.gb) * BigInt(GB),
        price: old.price,
        is_active: true,
      },
      data: { is_active: false },
    });
    console.log(
      `  Deactivated ${String(result.count)} plan(s): ${String(old.gb)} GB @ ${String(old.price)}`,
    );
  }

  // 2) Deactivate the per-GB plan group entirely.
  const perGbGroup = await prisma.planGroup.findFirst({ where: { type: 'per_gb' } });
  if (perGbGroup) {
    if (perGbGroup.is_active) {
      await prisma.planGroup.update({
        where: { id: perGbGroup.id },
        data: { is_active: false },
      });
      console.log(`  Deactivated per-GB group: code=${perGbGroup.code}`);
    } else {
      console.log(`  Per-GB group already inactive: code=${perGbGroup.code}`);
    }
  } else {
    console.log('  No per-GB group found, skipping.');
  }

  // 3) Create new fixed plans (idempotent: skip if an active plan with the same
  //    data_limit + price already exists in the fixed group).
  for (const p of NEW_FIXED_PLANS) {
    const dataLimit = BigInt(p.gb) * BigInt(GB);
    const existing = await prisma.plan.findFirst({
      where: {
        group_id: fixedGroup.id,
        data_limit: dataLimit,
        price: p.price,
        is_active: true,
      },
    });
    if (existing) {
      console.log(`  Already exists: ${String(p.gb)} GB @ ${String(p.price)} (id=${String(existing.id)})`);
      continue;
    }
    const created = await prisma.plan.create({
      data: {
        group_id: fixedGroup.id,
        name: `${String(p.gb)} گیگ`,
        data_limit: dataLimit,
        duration_days: fixedGroup.duration_days,
        price: p.price,
      },
    });
    console.log(`  Created: ${String(p.gb)} GB @ ${String(p.price)} (id=${String(created.id)})`);
  }

  console.log('Done.');
}

run()
  .catch((err) => {
    console.error('Update failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
