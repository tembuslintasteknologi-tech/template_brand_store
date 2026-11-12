# Graph Report - .  (2026-11-12)

## Corpus Check
- 152 files · ~76,171 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 911 nodes · 2204 edges · 44 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 642 · imports: 549 · imports_from: 281 · MODIFIES: 238 · calls: 234 · ON_BRANCH: 93 · method: 75 · references: 49 · PARENT_OF: 31 · implements: 5 · re_exports: 4 · inherits: 2 · cites: 1


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 152 · Candidates: 389
- Excluded: 5 untracked · 20618 ignored · 2 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `0de5313`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `db` - 34 edges
2. `authMiddleware()` - 18 edges
3. `TembusOnDemandProvider` - 18 edges
4. `TembusAggregatorProvider` - 17 edges
5. `unifiedConfig` - 16 edges
6. `orders` - 15 edges
7. `adminOnlyMiddleware()` - 15 edges
8. `LogisticAggregator` - 13 edges
9. `users` - 12 edges
10. `recordAdminAction()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `d4f150d chore: restore recovered application files` --ON_BRANCH--> `restore-recovered-files`  [EXTRACTED]
  git → git  _Bridges community 4 → community 17_
- `d4f150d chore: restore recovered application files` --ON_BRANCH--> `restore-recovered-files`  [EXTRACTED]
  git → git  _Bridges community 4 → community 20_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (49): getDefaultStoreLocation(), shipments, maxDays(), ProviderDescriptor, RateComparisonEntry, ShippingService, Address, CreateShipmentParams (+41 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (43): logger, logHttpRequest(), orderItems, products, adminOnlyMiddleware(), featureGate(), requestLogger(), clientIp() (+35 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (47): notificationPreferences, notificationTemplates, userDevices, buildDeepLink(), ChannelDecision, decideChannels(), DEFAULT_PREFERENCES, DEFAULT_TEMPLATES (+39 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (45): BrandProfile, brandProfileSchema, ConfigError, DEFAULT_FEATURE_FLAGS, featureFlagsSchema, getBrandProfile(), getFeatureFlags(), getMaintenanceMode() (+37 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (16): d4f150d chore: restore recovered application files, d4f150d chore: restore recovered application files, orders, shipments, admin_logs, users, banners, pages (+8 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (30): reviewHelpfulVotes, reviewReports, reviews, canWriteReview(), createReview(), hasPurchasedProduct(), helpfulCountsFor(), isPublicReview() (+22 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (13): ManualBankProvider, PaymentProvider, ENABLED_PAYMENTS, MidtransOptions, MidtransProvider, PaymentGatewayError, PaymentProvider, paymentManager (+5 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (23): bannerSchema, BannerWindow, ContentError, createBanner(), deleteBanner(), isBannerLive(), listAllBanners(), listPublicBanners() (+15 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (25): adminLogs, cartItems, carts, categories, flashSaleItems, flashSales, inventoryLogs, orderDisputes (+17 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (21): exportProducts(), buildPageSeo(), buildProductSeo(), clampText(), DEFAULT_SITE, firstImage(), getPageSeo(), getProductSeo() (+13 more)

### Community 10 - "Community 10"
Cohesion: 0.13
Nodes (16): unifiedConfig, client, closeDatabase(), pingDatabase(), orders, ARGON2_OPTIONS, defaultSettings(), seed() (+8 more)

### Community 11 - "Community 11"
Cohesion: 0.14
Nodes (20): notifications, wishlists, wishlistRoutes, addToWishlist(), BackInStockInput, dedupeProductIds(), deliverWishlistAlert(), discountPercent() (+12 more)

### Community 12 - "Community 12"
Cohesion: 0.17
Nodes (25): cart_items, carts, flash_sale_items, flash_sales, order_disputes, order_logs, orders, payment_webhooks (+17 more)

### Community 13 - "Community 13"
Cohesion: 0.13
Nodes (21): buildCsv(), buildExport(), ExportColumn, ExportFormat, ExportResult, buildProductImportTemplate(), BulkError, importProducts() (+13 more)

### Community 14 - "Community 14"
Cohesion: 0.16
Nodes (20): branchIdOf(), BranchScopeDecision, BranchScopeDenialCode, resolveBranchAccess(), ScopeUser, authMiddleware(), BranchScopeOptions, clearRevocationCache() (+12 more)

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (19): refunds, buildFinanceCsv(), computeFinancialSummary(), computeMargin(), EXCLUDED_STATUSES, FinanceError, FinanceOrderRow, FinanceRefundRow (+11 more)

### Community 16 - "Community 16"
Cohesion: 0.16
Nodes (17): isValidPhone(), maskPhone(), normalizePhoneNumber(), phoneSchema, readSmsConfig(), renderOtpMessage(), selectSmsProvider(), sendOtpSms() (+9 more)

### Community 17 - "Community 17"
Cohesion: 0.26
Nodes (23): backup/pre-secret-clean-main, backup/pre-secret-clean-recovery, main, rescue-recovered-15020f0, restore-recovered-files, sanitized-main, 0de5313 feat(branch): fondasi multi cabang BR-001..BR-004 (schema, scoping, stok per cabang), 15020f0 chore(sync): sync remote changes and finalize push notification mock (+15 more)

### Community 18 - "Community 18"
Cohesion: 0.25
Nodes (17): applyRelease(), applyReserve(), assertBranchStockRow(), assertQuantity(), BranchStockError, BranchStockErrorCode, BranchStockRow, canFulfill() (+9 more)

### Community 19 - "Community 19"
Cohesion: 0.20
Nodes (13): AdminActionInput, isUuid(), listAdminActions(), recordAdminAction(), ExportType, AdminUserError, countAdmins(), getCustomerDetail() (+5 more)

### Community 20 - "Community 20"
Cohesion: 0.36
Nodes (18): backup/pre-secret-clean-main, backup/pre-secret-clean-recovery, main, rescue-recovered-15020f0, restore-recovered-files, sanitized-main, 15020f0 chore(sync): sync remote changes and finalize push notification mock, 3364f6a feat(notifications): add mock push notification service and update checklist (+10 more)

### Community 21 - "Community 21"
Cohesion: 0.22
Nodes (4): LogisticProvider, pickNumber(), pickString(), TembusOnDemandProvider

### Community 22 - "Community 22"
Cohesion: 0.18
Nodes (12): AdminAlert, AlertOptions, buildAdminAlerts(), classifyStock(), buildChartSeries(), ChartSeries, DailyPoint, fillDailySeries() (+4 more)

### Community 23 - "Community 23"
Cohesion: 0.26
Nodes (13): checkoutRoutes, addCartItem(), calculateShippingRates(), Cart, CartItem, clearCart(), getCart(), memoryCarts (+5 more)

### Community 24 - "Community 24"
Cohesion: 0.21
Nodes (14): categories, order_items, orders, products, promo_usages, promos, public.categories, public.orders (+6 more)

### Community 25 - "Community 25"
Cohesion: 0.24
Nodes (10): CartTotals, computeCartTotals(), ComputeTotalsInput, DiscountType, evaluatePromo(), PromoEvaluation, PromoRejection, PromoRule (+2 more)

### Community 26 - "Community 26"
Cohesion: 0.22
Nodes (8): closeRedis(), ensureRedisConnected(), getRedisClient(), redisPing(), createApp(), app, ip(), request()

### Community 27 - "Community 27"
Cohesion: 0.37
Nodes (10): clearFailureCache(), clearFailures(), failureKey(), getLockState(), lockKey(), LockState, memoryFailures, memoryKey() (+2 more)

### Community 28 - "Community 28"
Cohesion: 0.27
Nodes (1): LogisticAggregator

### Community 29 - "Community 29"
Cohesion: 0.24
Nodes (9): app, readOrder(), readShipment(), rowsOf(), RUN_ID, seedOrder(), server, stub (+1 more)

### Community 30 - "Community 30"
Cohesion: 0.31
Nodes (9): canTransition(), isOrderStatus(), isTerminal(), nextStatuses(), ORDER_TRANSITIONS, OrderStatus, TERMINAL_STATUSES, TransitionResult (+1 more)

### Community 31 - "Community 31"
Cohesion: 0.32
Nodes (3): EventEmitter, RealtimeHub, realtimeRoutes

### Community 32 - "Community 32"
Cohesion: 0.32
Nodes (5): app, readOrder(), rowsOf(), seedOrder(), server

### Community 33 - "Community 33"
Cohesion: 0.40
Nodes (2): socialAuthSchema, SocialAuthService

### Community 34 - "Community 34"
Cohesion: 0.33
Nodes (2): allowUnsignedWebhook(), PaymentGatewayManager

### Community 35 - "Community 35"
Cohesion: 0.33
Nodes (3): results, stamp, today

### Community 36 - "Community 36"
Cohesion: 0.53
Nodes (4): formatOrderNumber(), orderNumberPrefix(), parseOrderNumber(), date

### Community 37 - "Community 37"
Cohesion: 0.80
Nodes (4): inventory_logs, product_variants, products, users

### Community 38 - "Community 38"
Cohesion: 0.60
Nodes (4): notification_preferences, notification_templates, notifications, users

### Community 39 - "Community 39"
Cohesion: 0.50
Nodes (1): RefundService

### Community 40 - "Community 40"
Cohesion: 0.40
Nodes (2): app, server

### Community 41 - "Community 41"
Cohesion: 0.40
Nodes (2): app, server

### Community 42 - "Community 42"
Cohesion: 0.83
Nodes (3): branch_inventory, product_variants, store_locations

### Community 43 - "Community 43"
Cohesion: 0.50
Nodes (2): app, server

## Knowledge Gaps
- **172 isolated node(s):** `categories`, `promos`, `settings`, `store_locations`, `users` (+167 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 28`** (1 nodes): `LogisticAggregator`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (2 nodes): `socialAuthSchema`, `SocialAuthService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (2 nodes): `allowUnsignedWebhook()`, `PaymentGatewayManager`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (1 nodes): `RefundService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (2 nodes): `app`, `server`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (2 nodes): `app`, `server`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (2 nodes): `app`, `server`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `db` connect `Community 22` to `Community 19`, `Community 33`, `Community 13`, `Community 9`, `Community 3`, `Community 7`, `Community 10`, `Community 15`, `Community 0`, `Community 2`, `Community 39`, `Community 5`, `Community 1`, `Community 23`, `Community 8`, `Community 11`, `Community 16`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `TembusOnDemandProvider` connect `Community 21` to `Community 10`, `Community 0`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `TembusAggregatorProvider` connect `Community 0` to `Community 10`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **What connects `categories`, `promos`, `settings` to the rest of the system?**
  _172 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05160628844839371 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06641604010025062 - nodes in this community are weakly interconnected._