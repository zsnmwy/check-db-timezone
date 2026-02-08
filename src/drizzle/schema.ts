import { bigint, pgTable, serial, text } from 'drizzle-orm/pg-core';

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  createdAtMs: bigint('created_at_ms', { mode: 'bigint' }).notNull(),
  paidAtMs: bigint('paid_at_ms', { mode: 'bigint' }),
  completedAtMs: bigint('completed_at_ms', { mode: 'bigint' }),
});

export const deliverySlots = pgTable('delivery_slots', {
  id: serial('id').primaryKey(),
  appointmentLocal: text('appointment_local').notNull(),
  appointmentTz: text('appointment_tz').notNull(),
  createdAtMs: bigint('created_at_ms', { mode: 'bigint' }).notNull(),
});
