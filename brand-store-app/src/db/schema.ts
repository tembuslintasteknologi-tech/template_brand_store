import { pgTable, uuid, varchar, text, timestamp, boolean, integer, decimal, jsonb, index, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core';

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
  lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
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

export const productVariants = pgTable('product_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  sku: varchar('sku', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  price: decimal('price', { precision: 12, scale: 2 }).notNull(),
  stock: integer('stock').notNull().default(0),
  reservedStock: integer('reserved_stock').notNull().default(0),
  lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
  attributes: jsonb('attributes').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  productIdx: index('variants_product_idx').on(table.productId),
  skuIdx: index('variants_sku_idx').on(table.sku),
}));

export const inventoryLogs = pgTable('inventory_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  variantId: uuid('variant_id').references(() => productVariants.id).notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  changeType: varchar('change_type', { length: 50 }).notNull(), // 'adjustment', 'reservation', 'release', 'sale'
  quantityChange: integer('quantity_change').notNull(),
  previousStock: integer('previous_stock').notNull(),
  newStock: integer('new_stock').notNull(),
  reason: text('reason'),
  referenceId: varchar('reference_id', { length: 100 }),
  performedBy: uuid('performed_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const storeLocations = pgTable('store_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 150 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  addressLine: text('address_line').notNull(),
  city: varchar('city', { length: 100 }).notNull(),
  province: varchar('province', { length: 100 }).notNull(),
  postalCode: varchar('postal_code', { length: 20 }).notNull(),
  isDefault: boolean('is_default').default(false),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const settings = pgTable('settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 150 }).notNull().unique(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

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
  expiresAt: timestamp('expires_at'),
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
  variantId: uuid('variant_id').references(() => productVariants.id),
  quantity: integer('quantity').notNull(),
  unitPrice: decimal('unit_price', { precision: 12, scale: 2 }).notNull(),
  totalPrice: decimal('total_price', { precision: 12, scale: 2 }).notNull(),
  productSnapshot: jsonb('product_snapshot'),
});

export const shipments = pgTable('shipments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  mode: varchar('mode', { length: 20 }).notNull(), // 'ondemand' | 'aggregator'
  service: varchar('service', { length: 50 }),
  awb: varchar('awb', { length: 100 }).notNull().unique(),
  status: varchar('status', { length: 50 }).notNull().default('created'),
  cost: decimal('cost', { precision: 12, scale: 2 }).default('0'),
  labelUrl: text('label_url'),
  trackingUrl: text('tracking_url'),
  deliveryInstructions: text('delivery_instructions'),
  trackingHistory: jsonb('tracking_history'),
  rawResponse: jsonb('raw_response'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orderIdx: index('shipments_order_idx').on(table.orderId),
  awbIdx: index('shipments_awb_idx').on(table.awb),
}));

export const adminLogs = pgTable('admin_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id),
  action: varchar('action', { length: 100 }).notNull(),
  targetType: varchar('target_type', { length: 50 }),
  targetId: varchar('target_id', { length: 100 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  actorIdx: index('admin_logs_actor_idx').on(table.actorId),
  actionIdx: index('admin_logs_action_idx').on(table.action),
}));

export const banners = pgTable('banners', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 150 }).notNull(),
  imageUrl: text('image_url').notNull(),
  linkUrl: text('link_url'),
  placement: varchar('placement', { length: 50 }).notNull().default('home_hero'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  startAt: timestamp('start_at'),
  endAt: timestamp('end_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  placementIdx: index('banners_placement_idx').on(table.placement),
  activeIdx: index('banners_active_idx').on(table.isActive),
}));

export const pages = pgTable('pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 150 }).notNull().unique(),
  title: varchar('title', { length: 200 }).notNull(),
  content: text('content').notNull(),
  metaTitle: varchar('meta_title', { length: 200 }),
  metaDescription: text('meta_description'),
  isPublished: boolean('is_published').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  slugIdx: index('pages_slug_idx').on(table.slug),
}));

export const notificationTemplates = pgTable('notification_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 100 }).notNull().unique(),
  channel: varchar('channel', { length: 20 }).notNull().default('in_app'), // 'in_app', 'email', 'both'
  category: varchar('category', { length: 50 }).notNull().default('order'),
  subject: varchar('subject', { length: 200 }),
  body: text('body').notNull(),
  deepLinkPattern: varchar('deep_link_pattern', { length: 200 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  templateCode: varchar('template_code', { length: 100 }),
  channel: varchar('channel', { length: 20 }).notNull().default('in_app'),
  category: varchar('category', { length: 50 }).notNull().default('order'),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body').notNull(),
  deepLink: text('deep_link'),
  data: jsonb('data'),
  deliveryStatus: varchar('delivery_status', { length: 30 }).notNull().default('delivered'),
  isRead: boolean('is_read').notNull().default(false),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: index('notifications_user_idx').on(table.userId),
  unreadIdx: index('notifications_unread_idx').on(table.isRead),
}));

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  inApp: boolean('in_app').notNull().default(true),
  email: boolean('email').notNull().default(true),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userCategoryIdx: uniqueIndex('notification_prefs_user_category_idx').on(table.userId, table.category),
}));

// ---------------------------------------------------------------------------
// USER SESSIONS
// ---------------------------------------------------------------------------
export const userSessions = pgTable('user_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  refreshToken: text('refresh_token').notNull().unique(),
  deviceInfo: jsonb('device_info'),
  ipAddress: varchar('ip_address', { length: 50 }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  revokedAt: timestamp('revoked_at'),
}, (table) => ({
  userIdx: index('user_sessions_user_idx').on(table.userId),
  expiresIdx: index('user_sessions_expires_idx').on(table.expiresAt),
}));

// ---------------------------------------------------------------------------
// USER ADDRESSES
// ---------------------------------------------------------------------------
export const userAddresses = pgTable('user_addresses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  label: varchar('label', { length: 100 }).notNull().default('home'),
  recipientName: varchar('recipient_name', { length: 150 }).notNull(),
  phone: varchar('phone', { length: 50 }).notNull(),
  province: varchar('province', { length: 100 }).notNull(),
  city: varchar('city', { length: 100 }).notNull(),
  district: varchar('district', { length: 100 }).notNull(),
  postalCode: varchar('postal_code', { length: 10 }).notNull(),
  addressLine: text('address_line').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: index('user_addresses_user_idx').on(table.userId),
}));

// ---------------------------------------------------------------------------
// PRODUCT IMAGES
// ---------------------------------------------------------------------------
export const productImages = pgTable('product_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  url: text('url').notNull(),
  altText: varchar('alt_text', { length: 200 }),
  sortOrder: integer('sort_order').notNull().default(0),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  productIdx: index('product_images_product_idx').on(table.productId),
}));

// ---------------------------------------------------------------------------
// CARTS
// ---------------------------------------------------------------------------
export const carts = pgTable('carts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: uniqueIndex('carts_user_idx').on(table.userId),
}));

// ---------------------------------------------------------------------------
// CART ITEMS
// ---------------------------------------------------------------------------
export const cartItems = pgTable('cart_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  cartId: uuid('cart_id').references(() => carts.id, { onDelete: 'cascade' }).notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
  quantity: integer('quantity').notNull().default(1),
  addedAt: timestamp('added_at').defaultNow().notNull(),
}, (table) => ({
  cartIdx: index('cart_items_cart_idx').on(table.cartId),
  cartProductVariantIdx: uniqueIndex('cart_items_cart_product_variant_idx').on(table.cartId, table.productId),
}));

// ---------------------------------------------------------------------------
// ORDER LOGS
// ---------------------------------------------------------------------------
export const orderLogs = pgTable('order_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  fromStatus: varchar('from_status', { length: 50 }),
  toStatus: varchar('to_status', { length: 50 }).notNull(),
  note: text('note'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orderIdx: index('order_logs_order_idx').on(table.orderId),
}));

// ---------------------------------------------------------------------------
// PAYMENTS
// ---------------------------------------------------------------------------
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  gateway: varchar('gateway', { length: 50 }).notNull(),
  gatewayTxId: varchar('gateway_tx_id', { length: 150 }).unique(),
  method: varchar('method', { length: 50 }),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('pending'),
  paidAt: timestamp('paid_at'),
  expiredAt: timestamp('expired_at'),
  snapToken: text('snap_token'),
  paymentUrl: text('payment_url'),
  rawResponse: jsonb('raw_response'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orderIdx: index('payments_order_idx').on(table.orderId),
  gatewayTxIdx: index('payments_gateway_tx_idx').on(table.gatewayTxId),
  statusIdx: index('payments_status_idx').on(table.status),
}));

// ---------------------------------------------------------------------------
// PAYMENT WEBHOOKS
// ---------------------------------------------------------------------------
export const paymentWebhooks = pgTable('payment_webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  gateway: varchar('gateway', { length: 50 }).notNull(),
  eventType: varchar('event_type', { length: 100 }),
  payload: jsonb('payload').notNull(),
  signature: varchar('signature', { length: 255 }),
  processed: boolean('processed').notNull().default(false),
  processedAt: timestamp('processed_at'),
  error: text('error'),
  receivedAt: timestamp('received_at').defaultNow().notNull(),
}, (table) => ({
  processedIdx: index('payment_webhooks_processed_idx').on(table.processed),
  gatewayIdx: index('payment_webhooks_gateway_idx').on(table.gateway),
}));

// ---------------------------------------------------------------------------
// REFUNDS
// ---------------------------------------------------------------------------
export const refunds = pgTable('refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  paymentId: uuid('payment_id').references(() => payments.id).notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  status: varchar('status', { length: 30 }).notNull().default('pending'),
  gatewayRefundId: varchar('gateway_refund_id', { length: 150 }),
  processedAt: timestamp('processed_at'),
  processedBy: uuid('processed_by').references(() => users.id),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orderIdx: index('refunds_order_idx').on(table.orderId),
  statusIdx: index('refunds_status_idx').on(table.status),
}));

// ---------------------------------------------------------------------------
// SHIPMENT TRACKING
// ---------------------------------------------------------------------------
export const shipmentTracking = pgTable('shipment_tracking', {
  id: uuid('id').primaryKey().defaultRandom(),
  shipmentId: uuid('shipment_id').references(() => shipments.id, { onDelete: 'cascade' }).notNull(),
  status: varchar('status', { length: 100 }).notNull(),
  description: text('description'),
  location: varchar('location', { length: 200 }),
  timestamp: timestamp('timestamp').notNull(),
  rawEvent: jsonb('raw_event'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  shipmentIdx: index('shipment_tracking_shipment_idx').on(table.shipmentId),
  timestampIdx: index('shipment_tracking_ts_idx').on(table.timestamp),
}));

// ---------------------------------------------------------------------------
// PROMOS
// ---------------------------------------------------------------------------
export const promos = pgTable('promos', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  discountType: varchar('discount_type', { length: 20 }).notNull(),
  discountValue: decimal('discount_value', { precision: 12, scale: 2 }).notNull(),
  minOrderAmount: decimal('min_order_amount', { precision: 12, scale: 2 }).default('0'),
  maxDiscount: decimal('max_discount', { precision: 12, scale: 2 }),
  usageLimit: integer('usage_limit'),
  usageCount: integer('usage_count').default(0).notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  codeIdx: index('promos_code_idx').on(table.code),
  activeIdx: index('promos_active_idx').on(table.isActive),
}));

// ---------------------------------------------------------------------------
// PROMO USAGES
// ---------------------------------------------------------------------------
export const promoUsages = pgTable('promo_usages', {
  id: uuid('id').primaryKey().defaultRandom(),
  promoId: uuid('promo_id').references(() => promos.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  discountAmount: decimal('discount_amount', { precision: 12, scale: 2 }).notNull(),
  usedAt: timestamp('used_at').defaultNow().notNull(),
}, (table) => ({
  promoIdx: index('promo_usages_promo_idx').on(table.promoId),
  userIdx: index('promo_usages_user_idx').on(table.userId),
}));

// ---------------------------------------------------------------------------
// FLASH SALES
// ---------------------------------------------------------------------------
export const flashSales = pgTable('flash_sales', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 150 }).notNull(),
  startAt: timestamp('start_at').notNull(),
  endAt: timestamp('end_at').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  activeIdx: index('flash_sales_active_idx').on(table.isActive),
  startIdx: index('flash_sales_start_idx').on(table.startAt),
}));

// ---------------------------------------------------------------------------
// FLASH SALE ITEMS
// ---------------------------------------------------------------------------
export const flashSaleItems = pgTable('flash_sale_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  flashSaleId: uuid('flash_sale_id').references(() => flashSales.id, { onDelete: 'cascade' }).notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'cascade' }),
  discountType: varchar('discount_type', { length: 20 }).notNull().default('percentage'),
  discountValue: decimal('discount_value', { precision: 12, scale: 2 }).notNull(),
  stock: integer('stock').notNull(),
  sold: integer('sold').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  flashSaleIdx: index('flash_sale_items_sale_idx').on(table.flashSaleId),
  productIdx: index('flash_sale_items_product_idx').on(table.productId),
}));

// ---------------------------------------------------------------------------
// REVIEWS
// ---------------------------------------------------------------------------
export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  orderId: uuid('order_id').references(() => orders.id),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  imageUrls: jsonb('image_urls'),
  isVerifiedPurchase: boolean('is_verified_purchase').notNull().default(false),
  adminReply: text('admin_reply'),
  adminRepliedAt: timestamp('admin_replied_at'),
  adminReplyBy: uuid('admin_reply_by').references(() => users.id),
  isVisible: boolean('is_visible').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  productIdx: index('reviews_product_idx').on(table.productId),
  userIdx: index('reviews_user_idx').on(table.userId),
  ratingIdx: index('reviews_rating_idx').on(table.rating),
}));

// ---------------------------------------------------------------------------
// WALLETS
// ---------------------------------------------------------------------------
export const wallets = pgTable('wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  balance: decimal('balance', { precision: 12, scale: 2 }).notNull().default('0'),
  currency: varchar('currency', { length: 10 }).notNull().default('IDR'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: uniqueIndex('wallets_user_idx').on(table.userId),
}));

// ---------------------------------------------------------------------------
// WALLET TRANSACTIONS
// ---------------------------------------------------------------------------
export const walletTransactions = pgTable('wallet_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id').references(() => wallets.id, { onDelete: 'cascade' }).notNull(),
  type: varchar('type', { length: 30 }).notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  balanceBefore: decimal('balance_before', { precision: 12, scale: 2 }).notNull(),
  balanceAfter: decimal('balance_after', { precision: 12, scale: 2 }).notNull(),
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: uuid('reference_id'),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  walletIdx: index('wallet_tx_wallet_idx').on(table.walletId),
  typeIdx: index('wallet_tx_type_idx').on(table.type),
  createdIdx: index('wallet_tx_created_idx').on(table.createdAt),
}));

// ---------------------------------------------------------------------------
// WISHLISTS
// ---------------------------------------------------------------------------
export const wishlists = pgTable('wishlists', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userProductIdx: uniqueIndex('wishlists_user_product_idx').on(table.userId, table.productId),
  userIdx: index('wishlists_user_idx').on(table.userId),
}));

// ---------------------------------------------------------------------------
// ORDER DISPUTES
// ---------------------------------------------------------------------------
export const orderDisputes = pgTable('order_disputes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  reason: varchar('reason', { length: 100 }).notNull(),
  description: text('description').notNull(),
  evidence: jsonb('evidence'),
  status: varchar('status', { length: 30 }).notNull().default('open'),
  resolvedAt: timestamp('resolved_at'),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolution: text('resolution'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orderIdx: index('order_disputes_order_idx').on(table.orderId),
  statusIdx: index('order_disputes_status_idx').on(table.status),
}));

// ---------------------------------------------------------------------------
// REVIEW REPORTS
// ---------------------------------------------------------------------------
export const reviewReports = pgTable('review_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id').references(() => reviews.id, { onDelete: 'cascade' }).notNull(),
  reportedBy: uuid('reported_by').references(() => users.id).notNull(),
  reason: varchar('reason', { length: 100 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 30 }).notNull().default('pending'),
  resolvedAt: timestamp('resolved_at'),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  reviewIdx: index('review_reports_review_idx').on(table.reviewId),
  statusIdx: index('review_reports_status_idx').on(table.status),
}));
