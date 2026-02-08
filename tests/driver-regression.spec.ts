import { describe, expect, beforeAll, beforeEach, afterAll, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient as ProbePrismaClient } from '../src/generated/prisma/probe-client/index.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { drizzleProbe } from '../src/drizzle/probes/schema.js';
import { ensureDbReachable, ensureTestTables, getDatabaseUrl, truncateAllTestTables } from './helpers/db.js';

const probeClient = new ProbePrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});
const pool = new Pool({ connectionString: getDatabaseUrl() });
const db = drizzle(pool);

describe('Driver 回归保护（当前生产驱动组合）', () => {
  beforeAll(async () => {
    await ensureDbReachable();
    await ensureTestTables();
  });

  beforeEach(async () => {
    await truncateAllTestTables();
  });

  afterAll(async () => {
    await probeClient.$disconnect();
    await pool.end();
  });

  it('Prisma DateTime 字段读取为 Date 对象', async () => {
    const fixedDate = new Date('2026-02-08T00:00:00.000Z');

    await probeClient.prismaProbe.create({
      data: {
        label: 'prisma_driver',
        tsWithoutTz: fixedDate,
        tsWithTz: fixedDate,
        epochMs: 1770508800000n,
      },
    });

    const row = await probeClient.prismaProbe.findFirstOrThrow();
    expect(row.tsWithoutTz).toBeInstanceOf(Date);
    expect(row.tsWithTz).toBeInstanceOf(Date);
  });

  it('Drizzle mode=date 读取 Date，mode=string 读取 string', async () => {
    const fixedDate = new Date('2026-02-08T00:00:00.000Z');

    await db.insert(drizzleProbe).values({
      label: 'drizzle_driver',
      tsWithoutTz: fixedDate,
      tsWithTz: fixedDate,
      tsString: '2026-02-08 00:00:00',
      epochMs: 1770508800000n,
    });

    const row = (await db.select().from(drizzleProbe))[0];
    expect(row.tsWithoutTz).toBeInstanceOf(Date);
    expect(row.tsWithTz).toBeInstanceOf(Date);
    expect(typeof row.tsString).toBe('string');
  });
});
