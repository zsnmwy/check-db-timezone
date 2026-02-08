import { describe, expect, beforeAll, beforeEach, afterAll, it } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { orders } from '../src/drizzle/schema.js';
import { drizzleProbe } from '../src/drizzle/probes/schema.js';
import { ensureDbReachable, ensureTestTables, getDatabaseUrl, truncateAllTestTables } from './helpers/db.js';

const pool = new Pool({ connectionString: getDatabaseUrl() });
const db = drizzle(pool);

describe('Drizzle 时区与 BigInt 基线', () => {
  beforeAll(async () => {
    await ensureDbReachable();
    await ensureTestTables();
  });

  beforeEach(async () => {
    await truncateAllTestTables();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('业务字段 *_at_ms 在 Drizzle 中使用 JS bigint', async () => {
    const fixedMs = 1770508800000n;

    await db.insert(orders).values({ createdAtMs: fixedMs });
    const rows = await db.select().from(orders);

    expect(rows).toHaveLength(1);
    expect(typeof rows[0].createdAtMs).toBe('bigint');
    expect(rows[0].createdAtMs).toBe(fixedMs);
  });

  it('mode=date 与 mode=string 行为区分明确', async () => {
    const fixedDate = new Date('2026-02-08T00:00:00.000Z');
    const fixedMs = 1770508800000n;

    await db.insert(drizzleProbe).values({
      label: 'mode_probe',
      tsWithoutTz: fixedDate,
      tsWithTz: fixedDate,
      tsString: '2026-02-08 00:00:00',
      epochMs: fixedMs,
    });

    const rows = await db.select().from(drizzleProbe);
    expect(rows).toHaveLength(1);
    expect(rows[0].tsWithoutTz).toBeInstanceOf(Date);
    expect(rows[0].tsWithTz).toBeInstanceOf(Date);
    expect(typeof rows[0].tsString).toBe('string');
    expect(rows[0].epochMs).toBe(fixedMs);
  });
});
