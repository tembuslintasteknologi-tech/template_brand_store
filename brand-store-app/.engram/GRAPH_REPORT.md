# Graph Report - .  (2026-11-11)

## Corpus Check
- 130 files · ~62,232 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 703 nodes · 1593 edges · 35 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 488 · imports: 420 · imports_from: 238 · calls: 145 · MODIFIES: 119 · method: 68 · references: 47 · ON_BRANCH: 44 · PARENT_OF: 13 · implements: 5 · re_exports: 4 · inherits: 2


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 130 · Candidates: 223
- Excluded: 134 untracked · 20618 ignored · 2 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `e4d31c7`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `db` - 28 edges
2. `TembusOnDemandProvider` - 18 edges
3. `TembusAggregatorProvider` - 17 edges
4. `unifiedConfig` - 16 edges
5. `authMiddleware()` - 14 edges
6. `orders` - 13 edges
7. `LogisticAggregator` - 13 edges
8. `users` - 12 edges
9. `adminOnlyMiddleware()` - 12 edges
10. `users` - 10 edges

## Surprising Connections (you probably didn't know these)
- `d4f150d chore: restore recovered application files` --ON_BRANCH--> `restore-recovered-files`  [EXTRACTED]
  git → git  _Bridges community 16 → community 11_
- `isFeatureEnabled()` --calls--> `getFeatureFlags()`  [EXTRACTED]
  src/services/config/settings.ts → src/services/config/settings.ts  _Bridges community 9 → community 4_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (42): unifiedConfig, client, closeDatabase(), db, pingDatabase(), orderItems, orders, products (+34 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (47): getDefaultStoreLocation(), shipments, maxDays(), ProviderDescriptor, RateComparisonEntry, ShippingService, Address, CreateShipmentParams (+39 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (48): notificationPreferences, notifications, notificationTemplates, userDevices, buildDeepLink(), ChannelDecision, decideChannels(), DEFAULT_PREFERENCES (+40 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (35): closeRedis(), ensureRedisConnected(), getRedisClient(), redisPing(), authMiddleware(), clearRevocationCache(), isTokenRevoked(), requireRole() (+27 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (36): BrandProfile, brandProfileSchema, ConfigError, DEFAULT_FEATURE_FLAGS, featureFlagsSchema, getBrandProfile(), getFeatureFlags(), getMaintenanceMode() (+28 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (30): AdminAlert, AlertOptions, buildAdminAlerts(), classifyStock(), AdminActionInput, isUuid(), listAdminActions(), recordAdminAction() (+22 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (15): ManualBankProvider, PaymentProvider, ENABLED_PAYMENTS, MidtransOptions, MidtransProvider, PaymentGatewayError, PaymentProvider, allowUnsignedWebhook() (+7 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (31): cartItems, carts, categories, flashSaleItems, flashSales, inventoryLogs, orderDisputes, orderLogs (+23 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (24): bannerSchema, BannerWindow, ContentError, createBanner(), deleteBanner(), isBannerLive(), listAllBanners(), listPublicBanners() (+16 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (20): isFeatureEnabled(), featureGate(), promoSchema, validatePromoSchema, CartTotals, computeCartTotals(), ComputeTotalsInput, DiscountType (+12 more)

### Community 10 - "Community 10"
Cohesion: 0.17
Nodes (25): cart_items, carts, flash_sale_items, flash_sales, order_disputes, order_logs, orders, payment_webhooks (+17 more)

### Community 11 - "Community 11"
Cohesion: 0.36
Nodes (18): backup/pre-secret-clean-main, backup/pre-secret-clean-recovery, main, rescue-recovered-15020f0, restore-recovered-files, sanitized-main, 15020f0 chore(sync): sync remote changes and finalize push notification mock, 3364f6a feat(notifications): add mock push notification service and update checklist (+10 more)

### Community 12 - "Community 12"
Cohesion: 0.22
Nodes (4): LogisticProvider, pickNumber(), pickString(), TembusOnDemandProvider

### Community 13 - "Community 13"
Cohesion: 0.18
Nodes (4): LogisticProvider, pickNumber(), pickString(), TembusAggregatorProvider

### Community 14 - "Community 14"
Cohesion: 0.26
Nodes (13): checkoutRoutes, addCartItem(), calculateShippingRates(), Cart, CartItem, clearCart(), getCart(), memoryCarts (+5 more)

### Community 15 - "Community 15"
Cohesion: 0.21
Nodes (14): categories, order_items, orders, products, promo_usages, promos, public.categories, public.orders (+6 more)

### Community 16 - "Community 16"
Cohesion: 0.18
Nodes (3): d4f150d chore: restore recovered application files, csrfMiddleware(), ioredis-mock

### Community 17 - "Community 17"
Cohesion: 0.37
Nodes (10): clearFailureCache(), clearFailures(), failureKey(), getLockState(), lockKey(), LockState, memoryFailures, memoryKey() (+2 more)

### Community 18 - "Community 18"
Cohesion: 0.27
Nodes (1): LogisticAggregator

### Community 19 - "Community 19"
Cohesion: 0.24
Nodes (9): app, readOrder(), readShipment(), rowsOf(), RUN_ID, seedOrder(), server, stub (+1 more)

### Community 20 - "Community 20"
Cohesion: 0.31
Nodes (9): canTransition(), isOrderStatus(), isTerminal(), nextStatuses(), ORDER_TRANSITIONS, OrderStatus, TERMINAL_STATUSES, TransitionResult (+1 more)

### Community 21 - "Community 21"
Cohesion: 0.32
Nodes (3): EventEmitter, RealtimeHub, realtimeRoutes

### Community 22 - "Community 22"
Cohesion: 0.32
Nodes (5): app, readOrder(), rowsOf(), seedOrder(), server

### Community 23 - "Community 23"
Cohesion: 0.38
Nodes (3): logger, logHttpRequest(), requestLogger()

### Community 24 - "Community 24"
Cohesion: 0.40
Nodes (2): socialAuthSchema, SocialAuthService

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (3): results, stamp, today

### Community 26 - "Community 26"
Cohesion: 0.53
Nodes (4): formatOrderNumber(), orderNumberPrefix(), parseOrderNumber(), date

### Community 27 - "Community 27"
Cohesion: 0.80
Nodes (4): inventory_logs, product_variants, products, users

### Community 28 - "Community 28"
Cohesion: 0.60
Nodes (4): notification_preferences, notification_templates, notifications, users

### Community 29 - "Community 29"
Cohesion: 0.83
Nodes (2): sanitizationMiddleware(), sanitize()

### Community 30 - "Community 30"
Cohesion: 0.50
Nodes (2): app, server

### Community 31 - "Community 31"
Cohesion: 1.00
Nodes (2): orders, shipments

### Community 32 - "Community 32"
Cohesion: 1.00
Nodes (2): admin_logs, users

### Community 33 - "Community 33"
Cohesion: 0.67
Nodes (2): banners, pages

### Community 34 - "Community 34"
Cohesion: 0.67
Nodes (2): ContextVariableMap, hono

## Knowledge Gaps
- **131 isolated node(s):** `categories`, `promos`, `settings`, `store_locations`, `users` (+126 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 18`** (1 nodes): `LogisticAggregator`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (2 nodes): `socialAuthSchema`, `SocialAuthService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (2 nodes): `sanitizationMiddleware()`, `sanitize()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (2 nodes): `app`, `server`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (2 nodes): `orders`, `shipments`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (2 nodes): `admin_logs`, `users`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (2 nodes): `banners`, `pages`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (2 nodes): `ContextVariableMap`, `hono`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TembusOnDemandProvider` connect `Community 12` to `Community 1`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `TembusAggregatorProvider` connect `Community 13` to `Community 1`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `LogisticAggregator` connect `Community 18` to `Community 1`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `categories`, `promos`, `settings` to the rest of the system?**
  _131 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05955734406438632 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0670762928827445 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06170598911070781 - nodes in this community are weakly interconnected._