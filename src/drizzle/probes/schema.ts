import { bigint, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const drizzleProbe = pgTable('drizzle_probe', {
  id: serial('id').primaryKey(),
  label: text('label').notNull().default(''),
  tsWithoutTz: timestamp('ts_without_tz', { mode: 'date' }).notNull(),
  tsWithTz: timestamp('ts_with_tz', { mode: 'date', withTimezone: true }).notNull(),
  tsString: timestamp('ts_string', { mode: 'string' }).notNull(),
  epochMs: bigint('epoch_ms', { mode: 'bigint' }).notNull(),
});
