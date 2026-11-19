import { pgTable, uuid, varchar, text, timestamp, boolean, integer, decimal, jsonb, index, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  role: varchar('role', { length: 50 }).notNull().default('customer'), // 'admin' (pusat), 'branch_admin' (cabang), 'customer'
  status: varchar('status', { length: 50 }).notNull().default('active'), // 'active', 'suspended', 'pending'
  branchId: uuid('branch_id').references(() => storeLocations.id, { onDelete: 'set null' }), // wajib terisi untuk role 'branch_admin'
  emailVerified: boolean('email_verified').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
  branchIdx: index('users_branch_idx').on(table.branchId),
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
  metaTitle: varchar('meta_title', { length: 200 }),
  metaDescription: text('meta_description'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  slugIdx: index('products_slug_idx').on(table.slug),
  categoryIdx: index('products_category_idx').on(table.categoryId),
  // Matches the public list: filter by status, order by createdAt desc with id as the tiebreak.
  paginationIdx: index('products_pagination_idx').on(table.status, table.createdAt, table.id),
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
  branchId: uuid('branch_id').references(() => storeLocations.id, { onDelete: 'set null' }),
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
}, (table) => ({
  branchIdx: index('inventory_logs_branch_idx').on(table.branchId),
}));

export const storeLocations = pgTable('store_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 20 }),
  name: varchar('name', { length: 150 }).notNull(),
  type: varchar('type', { length: 20 }).notNull().default('cabang'), // 'pusat' | 'cabang'
  phone: varchar('phone', { length: 50 }),
  addressLine: text('address_line').notNull(),
  city: varchar('city', { length: 100 }).notNull(),
  province: varchar('province', { length: 100 }).notNull(),
  postalCode: varchar('postal_code', { length: 20 }).notNull(),
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  ondemandEnabled: boolean('ondemand_enabled').notNull().default(true),
  serviceRadiusKm: integer('service_radius_km'),
  operatingHours: jsonb('operating_hours').default({}),
  managerName: varchar('manager_name', { length: 150 }),
  isOnline: boolean('is_online').notNull().default(true),
  isDefault: boolean('is_default').default(false),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  codeUidx: uniqueIndex('store_locations_code_uidx').on(table.code),
  typeActiveIdx: index('store_locations_type_active_idx').on(table.type, table.isActive),
}));

export const branchInventory = pgTable('branch_inventory', {
  id: uuid('id').primaryKey().defaultRandom(),
  branchId: uuid('branch_id').references(() => storeLocations.id, { onDelete: 'cascade' }).notNull(),
  variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'cascade' }).notNull(),
  stock: integer('stock').notNull().default(0),
  reservedStock: integer('reserved_stock').notNull().default(0),
  lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  branchVariantUidx: uniqueIndex('branch_inventory_branch_variant_uidx').on(table.branchId, table.variantId),
  variantIdx: index('branch_inventory_variant_idx').on(table.variantId),
  branchIdx: index('branch_inventory_branch_idx').on(table.branchId),
}));

export const stockTransfers = pgTable('stock_transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromBranchId: uuid('from_branch_id').references(() => storeLocations.id, { onDelete: 'cascade' }).notNull(),
  toBranchId: uuid('to_branch_id').references(() => storeLocations.id, { onDelete: 'cascade' }).notNull(),
  variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'cascade' }).notNull(),
  quantity: integer('quantity').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('draft'), // 'draft' | 'in_transit' | 'received' | 'cancelled'
  note: text('note'),
  requestedBy: uuid('requested_by').references(() => users.id),
  approvedBy: uuid('approved_by').references(() => users.id),
  shippedAt: timestamp('shipped_at'),
  receivedAt: timestamp('received_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  fromIdx: index('stock_transfers_from_idx').on(table.fromBranchId),
  toIdx: index('stock_transfers_to_idx').on(table.toBranchId),
  statusIdx: index('stock_transfers_status_idx').on(table.status),
  variantIdx: index('stock_transfers_variant_idx').on(table.variantId),
}));

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
  // BR-009: orders before the branch model came from the single pusat pool, so the default
  // reads as 'branch' instead of NULL. 'multi_branch' means the cart mixed branches.
  fulfillmentSource: varchar('fulfillment_source', { length: 20 }).notNull().default('branch'),
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
  // Cursor pagination: one index per list that walks newest first with id as the tiebreak.
  customerPaginationIdx: index('orders_customer_pagination_idx').on(table.customerId, table.createdAt, table.id),
  paginationIdx: index('orders_pagination_idx').on(table.createdAt, table.id),
}));

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  variantId: uuid('variant_id').references(() => productVariants.id),
  // BR-009: which branch ships this line, and how. Null branch means the pusat pool, which is
  // how every order placed before the branch model looks.
  sourceBranchId: uuid('source_branch_id').references(() => storeLocations.id, {
    onDelete: 'set null',
  }),
  fulfillmentMode: varchar('fulfillment_mode', { length: 20 }), // 'ondemand' | 'aggregator'
  quantity: integer('quantity').notNull(),
  unitPrice: decimal('unit_price', { precision: 12, scale: 2 }).notNull(),
  totalPrice: decimal('total_price', { precision: 12, scale: 2 }).notNull(),
  productSnapshot: jsonb('product_snapshot'),
}, (table) => ({
  sourceBranchIdx: index('order_items_source_branch_idx').on(table.sourceBranchId),
}));

export const shipments = pgTable('shipments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  // BR-009: the parcel leaves from the branch the customer picked, not from the default
  // location. Null keeps the old behaviour for orders created before this column existed.
  originBranchId: uuid('origin_branch_id').references(() => storeLocations.id, {
    onDelete: 'set null',
  }),
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
  originBranchIdx: index('shipments_origin_branch_idx').on(table.originBranchId),
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
  // 'all' shows to everyone, 'guest' only to signed-out visitors, 'customer' only to signed-in ones.
  audience: varchar('audience', { length: 50 }).notNull().default('all'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  startAt: timestamp('start_at'),
  endAt: timestamp('end_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  placementIdx: index('banners_placement_idx').on(table.placement),
  activeIdx: index('banners_active_idx').on(table.isActive),
  audienceIdx: index('banners_audience_idx').on(table.audience),
}));

// One row per impression or click. Deliberately append-only: no update path, so CTR is a
// count over immutable facts and cannot be rewritten by a later admin edit.
export const bannerEvents = pgTable('banner_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  bannerId: uuid('banner_id').notNull().references(() => banners.id, { onDelete: 'cascade' }),
  // CMS-005: null means the event was recorded against the banner itself, not an A/B variant.
  variantId: uuid('variant_id').references(() => bannerVariants.id, { onDelete: 'set null' }),
  eventType: varchar('event_type', { length: 20 }).notNull(), // 'view' | 'click'
  audience: varchar('audience', { length: 50 }).notNull().default('guest'), // 'guest' | 'customer'
  sessionId: varchar('session_id', { length: 100 }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  bannerEventIdx: index('banner_events_lookup_idx').on(table.bannerId, table.eventType, table.createdAt),
  variantEventIdx: index('banner_events_variant_idx').on(table.variantId, table.eventType),
  eventTimeIdx: index('banner_events_time_idx').on(table.createdAt),
}));

// ---------------------------------------------------------------------------
// BANNER A/B TESTING (CMS-005)
// ---------------------------------------------------------------------------
//
// A banner keeps its own fields as the control creative. Variants are alternate creatives for
// the same slot, and the experiment row decides which of them is eligible for assignment.
export const bannerVariants = pgTable('banner_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  bannerId: uuid('banner_id').notNull().references(() => banners.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 80 }).notNull(),
  imageUrl: text('image_url').notNull(),
  linkUrl: text('link_url'),
  // Relative traffic share. Integer so two variants can still split 50/50 without rounding drift.
  weight: integer('weight').notNull().default(50),
  isControl: boolean('is_control').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  bannerIdx: index('banner_variants_banner_idx').on(table.bannerId),
  bannerNameUidx: uniqueIndex('banner_variants_banner_name_uidx').on(table.bannerId, table.name),
}));

export const bannerExperiments = pgTable('banner_experiments', {
  id: uuid('id').primaryKey().defaultRandom(),
  bannerId: uuid('banner_id').notNull().references(() => banners.id, { onDelete: 'cascade' }).unique(),
  status: varchar('status', { length: 20 }).notNull().default('draft'), // 'draft' | 'running' | 'stopped'
  // Minimum impressions per variant before a winner is allowed to be applied.
  minViews: integer('min_views').notNull().default(100),
  winnerVariantId: uuid('winner_variant_id').references(() => bannerVariants.id, { onDelete: 'set null' }),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  statusIdx: index('banner_experiments_status_idx').on(table.status),
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
  // 'active' while the customer may still check out, 'abandoned' once the idle threshold passed,
  // 'converted' when checkout consumed the cart. A converted cart never gets a reminder.
  status: varchar('status', { length: 20 }).notNull().default('active'),
  lastActivityAt: timestamp('last_activity_at').defaultNow().notNull(),
  reminderSentAt: timestamp('reminder_sent_at'),
  reminderCount: integer('reminder_count').notNull().default(0),
  recoveryToken: varchar('recovery_token', { length: 64 }).unique(),
  recoveredAt: timestamp('recovered_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: uniqueIndex('carts_user_idx').on(table.userId),
  // Drives the abandonment scan: status plus idle time, id breaks ties on equal timestamps.
  idleIdx: index('carts_idle_idx').on(table.status, table.lastActivityAt, table.id),
  recoveryTokenIdx: index('carts_recovery_token_idx').on(table.recoveryToken),
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
  // FLS-006: null means no per-user cap on this line.
  perUserLimit: integer('per_user_limit'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  flashSaleIdx: index('flash_sale_items_sale_idx').on(table.flashSaleId),
  productIdx: index('flash_sale_items_product_idx').on(table.productId),
}));

// ---------------------------------------------------------------------------
// FLASH SALE PURCHASES (FLS-006 per-user ledger)
// ---------------------------------------------------------------------------
export const flashSalePurchases = pgTable('flash_sale_purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  flashSaleItemId: uuid('flash_sale_item_id')
    .references(() => flashSaleItems.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
  quantity: integer('quantity').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  itemUserIdx: index('flash_sale_purchases_item_user_idx').on(table.flashSaleItemId, table.userId),
  userIdx: index('flash_sale_purchases_user_idx').on(table.userId),
  orderIdx: index('flash_sale_purchases_order_idx').on(table.orderId),
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
// LOYALTY (LTY-001..004)
// ---------------------------------------------------------------------------
export const loyaltyAccounts = pgTable('loyalty_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  balance: integer('balance').notNull().default(0),
  lifetimePoints: integer('lifetime_points').notNull().default(0),
  // Cached projection of lifetimePoints. Every write path recomputes it from the tier rules,
  // so this column never decides a tier on its own.
  tier: varchar('tier', { length: 20 }).notNull().default('bronze'),
  tierUpdatedAt: timestamp('tier_updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: uniqueIndex('loyalty_accounts_user_idx').on(table.userId),
  tierIdx: index('loyalty_accounts_tier_idx').on(table.tier),
}));

export const loyaltyTransactions = pgTable('loyalty_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').references(() => loyaltyAccounts.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  type: varchar('type', { length: 20 }).notNull(), // 'earn', 'redeem', 'adjust', 'expire'
  source: varchar('source', { length: 20 }), // 'purchase', 'review', 'referral' for earn
  points: integer('points').notNull(), // signed: positive credits, negative debits
  balanceBefore: integer('balance_before').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: varchar('reference_id', { length: 100 }),
  note: text('note'),
  actorId: uuid('actor_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  accountIdx: index('loyalty_tx_account_idx').on(table.accountId),
  userIdx: index('loyalty_tx_user_idx').on(table.userId),
  typeIdx: index('loyalty_tx_type_idx').on(table.type),
  createdIdx: index('loyalty_tx_created_idx').on(table.createdAt),
  // One earn per source document. A retried purchase webhook cannot credit twice. Postgres
  // treats NULL reference_id values as distinct, so manual adjustments stay unrestricted.
  earnRefIdx: uniqueIndex('loyalty_tx_earn_ref_idx').on(
    table.userId,
    table.source,
    table.referenceId
  ),
}));

// ---------------------------------------------------------------------------
// REFERRAL (RFR-001..RFR-005)
// ---------------------------------------------------------------------------
export const referralCodes = pgTable('referral_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  code: varchar('code', { length: 16 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: uniqueIndex('referral_codes_user_idx').on(table.userId),
  codeIdx: uniqueIndex('referral_codes_code_idx').on(table.code),
}));

export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  referrerId: uuid('referrer_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  // One referral row per referee, enforced by a unique index. A customer cannot be claimed
  // twice, not even after the first referral is cancelled.
  refereeId: uuid('referee_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  code: varchar('code', { length: 16 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, qualified, rewarded, cancelled
  // Snapshot of the reward rules at claim time, so a program change later does not silently
  // rewrite what an existing referral promised.
  referrerPoints: integer('referrer_points').notNull().default(0),
  refereePoints: integer('referee_points').notNull().default(0),
  /** Order that qualified the referral. Set when an admin verifies the first paid order. */
  qualifyingOrderId: uuid('qualifying_order_id').references(() => orders.id),
  note: text('note'),
  qualifiedAt: timestamp('qualified_at'),
  rewardedAt: timestamp('rewarded_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  referrerIdx: index('referrals_referrer_idx').on(table.referrerId),
  refereeIdx: uniqueIndex('referrals_referee_idx').on(table.refereeId),
  statusIdx: index('referrals_status_idx').on(table.status),
  codeIdx: index('referrals_code_idx').on(table.code),
  createdIdx: index('referrals_created_idx').on(table.createdAt),
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
  // One cashback or one payment per reference. Postgres allows many NULL reference ids, so
  // admin adjustments and manual topups are unaffected while an order can never be paid twice.
  referenceIdx: uniqueIndex('wallet_tx_wallet_type_reference_idx').on(
    table.walletId,
    table.type,
    table.referenceId
  ),
}));

// ---------------------------------------------------------------------------
// WISHLISTS
// ---------------------------------------------------------------------------
export const wishlists = pgTable('wishlists', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  notifyPriceDrop: boolean('notify_price_drop').notNull().default(true),
  notifyBackInStock: boolean('notify_back_in_stock').notNull().default(true),
  lastNotifiedPrice: decimal('last_notified_price', { precision: 12, scale: 2 }),
  lastBackInStockNotifiedAt: timestamp('last_back_in_stock_notified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userProductIdx: uniqueIndex('wishlists_user_product_idx').on(table.userId, table.productId),
  userIdx: index('wishlists_user_idx').on(table.userId),
  productIdx: index('wishlists_product_idx').on(table.productId),
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

// ---------------------------------------------------------------------------
// REVIEW HELPFUL VOTES
// ---------------------------------------------------------------------------
export const reviewHelpfulVotes = pgTable('review_helpful_votes', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id').references(() => reviews.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  reviewUserIdx: uniqueIndex('review_helpful_review_user_idx').on(table.reviewId, table.userId),
  reviewIdx: index('review_helpful_review_idx').on(table.reviewId),
}));

// ---------------------------------------------------------------------------
// USER DEVICES (push notification tokens)
// ---------------------------------------------------------------------------
export const userDevices = pgTable('user_devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  platform: varchar('platform', { length: 20 }).notNull(), // 'android', 'ios', 'web'
  token: text('token').notNull().unique(),
  deviceName: varchar('device_name', { length: 150 }),
  appVersion: varchar('app_version', { length: 50 }),
  isActive: boolean('is_active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: index('user_devices_user_idx').on(table.userId),
  platformIdx: index('user_devices_platform_idx').on(table.platform),
}));

// ---------------------------------------------------------------------------
// LIVE CHAT (customer ke admin/cabang)
// ---------------------------------------------------------------------------
//
// Satu percakapan milik satu customer dan diarahkan ke satu cabang. `routingReason` menyimpan
// kenapa cabang itu dipilih supaya pertanyaan "kenapa masuk ke cabang ini" bisa dijawab tanpa
// menebak isi tabel stok saat itu.
export const chatConversations = pgTable('chat_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  branchId: uuid('branch_id').references(() => storeLocations.id, { onDelete: 'set null' }),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  subject: varchar('subject', { length: 200 }),
  status: varchar('status', { length: 20 }).notNull().default('open'), // 'open' | 'assigned' | 'closed'
  assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  routingReason: varchar('routing_reason', { length: 40 }).notNull().default('manual'),
  lastMessageAt: timestamp('last_message_at').defaultNow().notNull(),
  closedAt: timestamp('closed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: index('chat_conversations_user_idx').on(table.userId, table.lastMessageAt),
  branchStatusIdx: index('chat_conversations_branch_status_idx').on(table.branchId, table.status, table.lastMessageAt),
  statusIdx: index('chat_conversations_status_idx').on(table.status, table.lastMessageAt),
}));

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => chatConversations.id, { onDelete: 'cascade' }).notNull(),
  senderId: uuid('sender_id').references(() => users.id, { onDelete: 'set null' }),
  senderRole: varchar('sender_role', { length: 20 }).notNull(), // 'customer' | 'branch_admin' | 'admin' | 'system'
  body: text('body').notNull(),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // Cursor order is (created_at DESC, id DESC) per conversation.
  conversationIdx: index('chat_messages_conversation_idx').on(table.conversationId, table.createdAt, table.id),
}));

// ---------------------------------------------------------------------------
// ADMIN TOTP (AUT-012)
// ---------------------------------------------------------------------------
//
// `secretEncrypted` disimpan dalam bentuk AES-256-GCM, bukan base32 polos. Recovery codes
// disimpan sebagai hash argon2 sehingga kebocoran tabel tidak langsung membuka akun.
export const adminTotp = pgTable('admin_totp', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  secretEncrypted: text('secret_encrypted').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  confirmedAt: timestamp('confirmed_at'),
  lastUsedAt: timestamp('last_used_at'),
  recoveryCodes: jsonb('recovery_codes').default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userUidx: uniqueIndex('admin_totp_user_uidx').on(table.userId),
}));

// ---------------------------------------------------------------------------
// GRANULAR ADMIN PERMISSIONS (AUT-013)
// ---------------------------------------------------------------------------
//
// Satu baris per permission per user. `effect` membedakan penambahan scope dari pencabutan
// scope bawaan role, jadi role tetap menjadi batas atas sementara admin pusat bisa
// mempersempit atau memperluas akun staf tanpa mengubah role-nya.
export const adminPermissionGrants = pgTable('admin_permission_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  permission: varchar('permission', { length: 64 }).notNull(),
  effect: varchar('effect', { length: 10 }).notNull().default('grant'), // 'grant' | 'revoke'
  grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userPermissionUidx: uniqueIndex('admin_permission_grants_user_permission_uidx').on(
    table.userId,
    table.permission
  ),
  userIdx: index('admin_permission_grants_user_idx').on(table.userId),
}));

// ---------------------------------------------------------------------------
// PRICING ENGINE (PRC-002, PRC-003, PRC-004)
// ---------------------------------------------------------------------------
//
// Three tables: the rule itself, the customer groups used by `customer_group` rules, and the
// membership rows. Rules never stack (see `pricingEngine.ts`), so a product can carry several
// rows and still resolve to exactly one price per quote.
export const pricingRules = pgTable('pricing_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 150 }).notNull(),
  type: varchar('type', { length: 30 }).notNull().default('dynamic'), // 'dynamic' | 'tiered' | 'customer_group'
  percentOff: decimal('percent_off', { precision: 5, scale: 2 }),
  // Only for `tiered`: [{ minQuantity, percentOff }] sorted ascending in the admin form.
  tiers: jsonb('tiers').default([]),
  // Only for `customer_group`, stores the group slug so a rename does not orphan the rule.
  customerGroup: varchar('customer_group', { length: 80 }),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  priority: integer('priority').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  startAt: timestamp('start_at'),
  endAt: timestamp('end_at'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  typeIdx: index('pricing_rules_type_idx').on(table.type),
  activeIdx: index('pricing_rules_active_idx').on(table.isActive, table.startAt, table.endAt),
  productIdx: index('pricing_rules_product_idx').on(table.productId),
  categoryIdx: index('pricing_rules_category_idx').on(table.categoryId),
  groupIdx: index('pricing_rules_group_idx').on(table.customerGroup),
}));

export const customerGroups = pgTable('customer_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 80 }).notNull().unique(),
  name: varchar('name', { length: 150 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  slugIdx: index('customer_groups_slug_idx').on(table.slug),
}));

export const customerGroupMembers = pgTable('customer_group_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').notNull().references(() => customerGroups.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  groupUserUidx: uniqueIndex('customer_group_members_group_user_uidx').on(table.groupId, table.userId),
  userIdx: index('customer_group_members_user_idx').on(table.userId),
}));
