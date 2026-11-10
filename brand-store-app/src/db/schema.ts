import { pgTable, uuid, varchar, text, timestamp, boolean, integer, decimal, jsonb, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  role: varchar('role', { length: 50 }).notNull().default('customer'), // 'admin', 'customer'
  status: varchar('status', { length: 50 }).notNull().default('active'), // 'active', 'suspended', 'pending'
  emailVerified: boolean('email_verified').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
}));

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 150 }).notNull(),
  slug: varchar('slug', { length: 150 }).notNull().unique(),
  parentId: uuid('parent_id'),
  image: text('image'),
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  categoryId: uuid('category_id').references(() => categories.id),
  basePrice: decimal('base_price', { precision: 12, scale: 2 }).notNull(),
  compareAtPrice: decimal('compare_at_price', { precision: 12, scale: 2 }),
  sku: varchar('sku', { length: 100 }).unique(),
  stock: integer('stock').notNull().default(0),
  status: varchar('status', { length: 50 }).notNull().default('draft'), // 'draft', 'published', 'archived'
  images: jsonb('images').default([]),
  attributes: jsonb('attributes').default({}),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  slugIdx: index('products_slug_idx').on(table.slug),
  categoryIdx: index('products_category_idx').on(table.categoryId),
}));

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderNumber: varchar('order_number', { length: 100 }).notNull().unique(),
  customerId: uuid('customer_id').references(() => users.id).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // 'pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),
  shippingAmount: decimal('shipping_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  discountAmount: decimal('discount_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  shippingAddress: jsonb('shipping_address').notNull(),
  paymentDetails: jsonb('payment_details'),
  shippingDetails: jsonb('shipping_details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  customerIdx: index('orders_customer_idx').on(table.customerId),
  orderNumberIdx: index('orders_number_idx').on(table.orderNumber),
}));

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: decimal('unit_price', { precision: 12, scale: 2 }).notNull(),
  totalPrice: decimal('total_price', { precision: 12, scale: 2 }).notNull(),
  productSnapshot: jsonb('product_snapshot'),
});
