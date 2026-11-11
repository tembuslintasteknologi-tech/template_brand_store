import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from '../db/schema.js';
import * as promosSchema from '../db/promosSchema.js';

test('Database Schema Verification: All Required Tables and Columns Defined', async (t) => {
  await t.test('users, user_sessions, user_addresses schemas exist', () => {
    assert.ok(schema.users, 'users table must exist');
    assert.ok((schema as any).userSessions, 'userSessions table must exist');
    assert.ok((schema as any).userAddresses, 'userAddresses table must exist');
  });

  await t.test('categories, products, product_variants, product_images schemas exist', () => {
    assert.ok(schema.categories, 'categories table must exist');
    assert.ok(schema.products, 'products table must exist');
    assert.ok(schema.productVariants, 'productVariants table must exist');
    assert.ok((schema as any).productImages, 'productImages table must exist');
  });

  await t.test('carts and cart_items schemas exist', () => {
    assert.ok((schema as any).carts, 'carts table must exist');
    assert.ok((schema as any).cartItems, 'cartItems table must exist');
  });

  await t.test('orders, order_items, order_logs schemas exist', () => {
    assert.ok(schema.orders, 'orders table must exist');
    assert.ok(schema.orderItems, 'orderItems table must exist');
    assert.ok((schema as any).orderLogs, 'orderLogs table must exist');
  });

  await t.test('payments, payment_webhooks, refunds schemas exist', () => {
    assert.ok((schema as any).payments, 'payments table must exist');
    assert.ok((schema as any).paymentWebhooks, 'paymentWebhooks table must exist');
    assert.ok((schema as any).refunds, 'refunds table must exist');
  });

  await t.test('shipments and shipment_tracking schemas exist', () => {
    assert.ok(schema.shipments, 'shipments table must exist');
    assert.ok((schema as any).shipmentTracking, 'shipmentTracking table must exist');
  });

  await t.test('promos, promo_usages, flash_sales, flash_sale_items schemas exist', () => {
    assert.ok(promosSchema.promos, 'promos table must exist');
    assert.ok(promosSchema.promoUsages, 'promoUsages table must exist');
    assert.ok((promosSchema as any).flashSales, 'flashSales table must exist in promosSchema');
    assert.ok((schema as any).flashSales, 'flashSales table must exist in schema');
    assert.ok((promosSchema as any).flashSaleItems, 'flashSaleItems table must exist in promosSchema');
    assert.ok((schema as any).flashSaleItems, 'flashSaleItems table must exist in schema');
  });

  await t.test('reviews with admin_reply columns exists', () => {
    const reviewsTable = (schema as any).reviews;
    assert.ok(reviewsTable, 'reviews table must exist');
    assert.ok(reviewsTable.adminReply, 'adminReply column must exist');
    assert.ok(reviewsTable.adminRepliedAt, 'adminRepliedAt column must exist');
    assert.ok(reviewsTable.adminReplyBy, 'adminReplyBy column must exist');
  });

  await t.test('wallets and wallet_transactions schemas exist', () => {
    assert.ok((schema as any).wallets, 'wallets table must exist');
    assert.ok((schema as any).walletTransactions, 'walletTransactions table must exist');
  });

  await t.test('notifications, notification_templates, notification_preferences exist', () => {
    assert.ok(schema.notifications, 'notifications table must exist');
    assert.ok(schema.notificationTemplates, 'notificationTemplates table must exist');
    assert.ok(schema.notificationPreferences, 'notificationPreferences table must exist');
  });

  await t.test('wishlists, order_disputes, review_reports schemas exist', () => {
    assert.ok((schema as any).wishlists, 'wishlists table must exist');
    assert.ok((schema as any).orderDisputes, 'orderDisputes table must exist');
    assert.ok((schema as any).reviewReports, 'reviewReports table must exist');
  });

  await t.test('drizzle migration 0006 file exists and journal is updated', () => {
    const migrationFile = path.resolve(process.cwd(), 'drizzle/0006_complete_db_tables.sql');
    assert.ok(fs.existsSync(migrationFile), '0006_complete_db_tables.sql must exist');

    const journalFile = path.resolve(process.cwd(), 'drizzle/meta/_journal.json');
    assert.ok(fs.existsSync(journalFile), '_journal.json must exist');
    const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
    const entry0006 = journal.entries.find((e: any) => e.tag === '0006_complete_db_tables');
    assert.ok(entry0006, 'Journal entry for 0006_complete_db_tables must exist');
  });
});
