import { pgTable, uuid, varchar, text, timestamp, boolean, integer, decimal, jsonb, index } from 'drizzle-orm/pg-core';
import { users, products, orders } from './schema.js';

export const promos = pgTable('promos', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  discountType: varchar('discount_type', { length: 20 }).notNull(), // 'percentage', 'fixed'
  discountValue: decimal('discount_value', { precision: 12, scale: 2 }).notNull(),
  minOrderAmount: decimal('min_order_amount', { precision: 12, scale: 2 }).default('0'),
  maxDiscount: decimal('max_discount', { precision: 12, scale: 2 }),
  usageLimit: integer('usage_limit'),
  usageCount: integer('usage_count').default(0).notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const promoUsages = pgTable('promo_usages', {
  id: uuid('id').primaryKey().defaultRandom(),
  promoId: uuid('promo_id').references(() => promos.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  discountAmount: decimal('discount_amount', { precision: 12, scale: 2 }).notNull(),
  usedAt: timestamp('used_at').defaultNow().notNull(),
});
