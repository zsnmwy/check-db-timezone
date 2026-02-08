import { describe, expect, beforeAll, beforeEach, afterAll, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient as BusinessPrismaClient } from '../src/generated/prisma/business-client/index.js';
import { PrismaClient as ProbePrismaClient } from '../src/generated/prisma/probe-client/index.js';
import { ensureDbReachable, ensureTestTables, fetchProbeEpochDiffHours, getDatabaseUrl, truncateAllTestTables } from './helpers/db.js';

const businessClient = new BusinessPrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});
const probeClient = new ProbePrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

describe('Prisma 时区与 BigInt 基线', () => {
  beforeAll(async () => {
    await ensureDbReachable();
    await ensureTestTables();
  });

  beforeEach(async () => {
    await truncateAllTestTables();
  });

  afterAll(async () => {
    await businessClient.$disconnect();
    await probeClient.$disconnect();
  });

  it('业务字段 *_at_ms 使用 BigInt 且 round-trip 一致', async () => {
    const fixedMs = 1770508800000n; // 2026-02-08T00:00:00.000Z

    const row = await businessClient.order.create({
      data: {
        createdAtMs: fixedMs,
      },
    });

    expect(typeof row.createdAtMs).toBe('bigint');
    expect(row.createdAtMs).toBe(fixedMs);
  });

  it('timestamp without time zone 与 timestamptz 在带 offset 输入下产生语义差异', async () => {
    await probeClient.$executeRawUnsafe(`
      INSERT INTO prisma_probe (label, ts_without_tz, ts_with_tz, epoch_ms)
      VALUES (
        'offset_probe',
        '2026-02-08 08:00:00+08',
        '2026-02-08 08:00:00+08',
        1770508800000
      );
    `);

    const diffHours = await fetchProbeEpochDiffHours();
    expect(diffHours).toBe(8);
  });
});
