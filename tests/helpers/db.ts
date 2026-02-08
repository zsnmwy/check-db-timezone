import { Pool } from 'pg';

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:55432/check_db_timezone';

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

export async function withPgPool<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

export async function ensureDbReachable(): Promise<void> {
  await withPgPool(async (pool) => {
    await pool.query('select 1');
  });
}

export async function ensureTestTables(): Promise<void> {
  await withPgPool(async (pool) => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id serial PRIMARY KEY,
        created_at_ms bigint NOT NULL,
        paid_at_ms bigint,
        completed_at_ms bigint
      );

      CREATE TABLE IF NOT EXISTS delivery_slots (
        id serial PRIMARY KEY,
        appointment_local text NOT NULL,
        appointment_tz text NOT NULL,
        created_at_ms bigint NOT NULL
      );

      CREATE TABLE IF NOT EXISTS prisma_probe (
        id serial PRIMARY KEY,
        label text NOT NULL DEFAULT '',
        ts_without_tz timestamp NOT NULL,
        ts_with_tz timestamptz NOT NULL,
        epoch_ms bigint NOT NULL
      );

      CREATE TABLE IF NOT EXISTS drizzle_probe (
        id serial PRIMARY KEY,
        label text NOT NULL DEFAULT '',
        ts_without_tz timestamp NOT NULL,
        ts_with_tz timestamptz NOT NULL,
        ts_string timestamp NOT NULL,
        epoch_ms bigint NOT NULL
      );
    `);
  });
}

export async function truncateAllTestTables(): Promise<void> {
  await withPgPool(async (pool) => {
    await pool.query(`
      TRUNCATE TABLE prisma_probe RESTART IDENTITY CASCADE;
      TRUNCATE TABLE drizzle_probe RESTART IDENTITY CASCADE;
      TRUNCATE TABLE orders RESTART IDENTITY CASCADE;
      TRUNCATE TABLE delivery_slots RESTART IDENTITY CASCADE;
    `);
  });
}

export async function fetchProbeEpochDiffHours(): Promise<number> {
  return withPgPool(async (pool) => {
    const result = await pool.query<{ diff_hours: string }>(`
      SELECT ((EXTRACT(EPOCH FROM ts_without_tz) - EXTRACT(EPOCH FROM ts_with_tz)) / 3600)::text AS diff_hours
      FROM prisma_probe
      ORDER BY id DESC
      LIMIT 1;
    `);

    return Number(result.rows[0]?.diff_hours ?? 'NaN');
  });
}
