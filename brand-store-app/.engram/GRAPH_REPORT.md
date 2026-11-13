# Graph Report - .  (2026-11-13)

## Corpus Check
- 178 files · ~103,687 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1173 nodes · 2865 edges · 59 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 863 · imports: 791 · imports_from: 377 · calls: 306 · MODIFIES: 238 · ON_BRANCH: 102 · method: 81 · references: 52 · PARENT_OF: 40 · implements: 5 · inherits: 5 · re_exports: 4 · cites: 1


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 178 · Candidates: 473
- Excluded: 0 untracked · 20618 ignored · 2 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `781d54f`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `db` - 43 edges
2. `authMiddleware()` - 21 edges
3. `unifiedConfig` - 18 edges
4. `orders` - 18 edges
5. `TembusOnDemandProvider` - 18 edges
6. `TembusAggregatorProvider` - 17 edges
7. `adminOnlyMiddleware()` - 16 edges
8. `products` - 15 edges
9. `OrderSourceError` - 13 edges
10. `StockTransferError` - 13 edges

## Surprising Connections (you probably didn't know these)
- `resolveAnalyticsWindow()` --calls--> `BranchAnalyticsError`  [EXTRACTED]
  src/services/admin/branchAnalytics.ts → src/services/admin/branchAnalytics.ts  _Bridges community 14 → community 44_
- `assertBranchCanFulfill()` --calls--> `OrderSourceError`  [EXTRACTED]
  src/services/branch/orderSourceService.ts → src/services/branch/orderSourceService.ts  _Bridges community 11 → community 48_
- `d4f150d chore: restore recovered application files` --ON_BRANCH--> `restore-recovered-files`  [EXTRACTED]
  git → git  _Bridges community 4 → community 8_
- `getShowAggregatorWithinRadius()` --calls--> `getSettingValue()`  [EXTRACTED]
  src/services/config/settings.ts → src/services/config/settings.ts  _Bridges community 36 → community 0_
- `isFeatureEnabled()` --calls--> `getFeatureFlags()`  [EXTRACTED]
  src/services/config/settings.ts → src/services/config/settings.ts  _Bridges community 33 → community 0_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (56): assertBranchDeactivatable(), assertBranchDeletable(), assertOndemandUsable(), BranchValidationCode, BranchValidationError, coerceCoordinate(), CoordinateKind, Coordinates (+48 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (47): notificationPreferences, notificationTemplates, userDevices, buildDeepLink(), ChannelDecision, decideChannels(), DEFAULT_PREFERENCES, DEFAULT_TEMPLATES (+39 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (44): adjustBranchStock(), AdjustBranchStockInput, BranchInventoryItem, ensureBranchRow(), listBranchInventory(), listBranchInventoryLogs(), syncVariantAggregate(), applyReceiveStock() (+36 more)

### Community 3 - "Community 3"
Cohesion: 0.10
Nodes (39): assertReservationInput(), BranchReleaseResult, BranchReservationResult, loadBranchRow(), loadProductId(), loadReferenceLogs(), releaseStockAtBranch(), reserveStockAtBranch() (+31 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (20): d4f150d chore: restore recovered application files, d4f150d chore: restore recovered application files, orders, shipments, admin_logs, users, banners, pages (+12 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (30): reviewHelpfulVotes, reviewReports, reviews, canWriteReview(), createReview(), hasPurchasedProduct(), helpfulCountsFor(), isPublicReview() (+22 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (13): ManualBankProvider, PaymentProvider, ENABLED_PAYMENTS, MidtransOptions, MidtransProvider, PaymentGatewayError, PaymentProvider, paymentManager (+5 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (30): userAddresses, Coordinates, DELIVERY_MODES, DeliveryMode, DeliveryModeInput, DeliveryModeReason, DeliveryModeResult, haversineDistanceKm() (+22 more)

### Community 8 - "Community 8"
Cohesion: 0.17
Nodes (32): backup/pre-secret-clean-main, backup/pre-secret-clean-recovery, main, rescue-recovered-15020f0, restore-recovered-files, sanitized-main, 0bc44bb feat(BR-013): dashboard cabang, 0de5313 feat(branch): fondasi multi cabang BR-001..BR-004 (schema, scoping, stok per cabang) (+24 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (23): unifiedConfig, ARGON2_OPTIONS, defaultSettings(), ensureCatalog(), ensureInventory(), ensureLocation(), locationPayload(), seed() (+15 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (23): bannerSchema, BannerWindow, ContentError, createBanner(), deleteBanner(), isBannerLive(), listAllBanners(), listPublicBanners() (+15 more)

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (25): assertBranchCanFulfill(), assertFulfillmentMode(), branchSellableStock(), BranchShipmentItem, BranchShipmentPlan, BranchSnapshot, BranchSnapshotInput, BranchTaggedItem (+17 more)

### Community 12 - "Community 12"
Cohesion: 0.13
Nodes (21): exportProducts(), buildPageSeo(), buildProductSeo(), clampText(), DEFAULT_SITE, firstImage(), getPageSeo(), getProductSeo() (+13 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (15): closeRedis(), client, closeDatabase(), pingDatabase(), app, server, app, server (+7 more)

### Community 14 - "Community 14"
Cohesion: 0.14
Nodes (23): BranchAnalyticsEntry, BranchAnalyticsErrorCode, BranchAnalyticsReport, BranchAnalyticsRollup, BranchRef, buildBranchAnalytics(), BuildBranchAnalyticsInput, isRevenue() (+15 more)

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (20): notifications, wishlists, wishlistRoutes, addToWishlist(), BackInStockInput, dedupeProductIds(), deliverWishlistAlert(), discountPercent() (+12 more)

### Community 16 - "Community 16"
Cohesion: 0.17
Nodes (25): cart_items, carts, flash_sale_items, flash_sales, order_disputes, order_logs, orders, payment_webhooks (+17 more)

### Community 17 - "Community 17"
Cohesion: 0.13
Nodes (21): buildCsv(), buildExport(), ExportColumn, ExportFormat, ExportResult, buildProductImportTemplate(), BulkError, importProducts() (+13 more)

### Community 18 - "Community 18"
Cohesion: 0.14
Nodes (20): refunds, buildFinanceCsv(), computeFinancialSummary(), computeMargin(), EXCLUDED_STATUSES, FinanceError, FinanceOrderRow, FinanceRefundRow (+12 more)

### Community 19 - "Community 19"
Cohesion: 0.16
Nodes (17): isValidPhone(), maskPhone(), normalizePhoneNumber(), phoneSchema, readSmsConfig(), renderOtpMessage(), selectSmsProvider(), sendOtpSms() (+9 more)

### Community 20 - "Community 20"
Cohesion: 0.16
Nodes (19): maxDays(), ProviderDescriptor, RateComparisonEntry, ShippingService, LogisticProvider, PickupParams, PickupResult, RateCalculationParams (+11 more)

### Community 21 - "Community 21"
Cohesion: 0.14
Nodes (17): adminRoutes, analyticsRoutes, authRoutes, logisticsRoutes, logisticsWebhookRoutes, notificationAdminRoutes, notificationRoutes, orderRoutes (+9 more)

### Community 22 - "Community 22"
Cohesion: 0.13
Nodes (17): adminLogs, branchInventory, cartItems, carts, flashSaleItems, flashSales, orderDisputes, orderLogs (+9 more)

### Community 23 - "Community 23"
Cohesion: 0.14
Nodes (14): shipments, CreateShipmentParams, ShipmentStatus, createShipmentForOrder(), CreateShipmentInput, persistTracking(), syncOrderFromShipment(), FailureResolution (+6 more)

### Community 24 - "Community 24"
Cohesion: 0.20
Nodes (13): AdminActionInput, isUuid(), listAdminActions(), recordAdminAction(), ExportType, AdminUserError, countAdmins(), getCustomerDetail() (+5 more)

### Community 25 - "Community 25"
Cohesion: 0.23
Nodes (13): ensureRedisConnected(), getRedisClient(), redisPing(), clearFailureCache(), clearFailures(), failureKey(), getLockState(), lockKey() (+5 more)

### Community 26 - "Community 26"
Cohesion: 0.36
Nodes (18): backup/pre-secret-clean-main, backup/pre-secret-clean-recovery, main, rescue-recovered-15020f0, restore-recovered-files, sanitized-main, 15020f0 chore(sync): sync remote changes and finalize push notification mock, 3364f6a feat(notifications): add mock push notification service and update checklist (+10 more)

### Community 27 - "Community 27"
Cohesion: 0.22
Nodes (4): LogisticProvider, pickNumber(), pickString(), TembusOnDemandProvider

### Community 28 - "Community 28"
Cohesion: 0.24
Nodes (16): adminOnlyMiddleware(), authMiddleware(), BranchScopeOptions, clearRevocationCache(), isTokenRevoked(), requireRole(), revokeToken(), signAccessToken() (+8 more)

### Community 29 - "Community 29"
Cohesion: 0.15
Nodes (13): assembleBranches(), AssembleBranchesOptions, BranchAvailability, BranchAvailabilityOptions, BranchAvailabilityResult, BranchAvailabilityRow, BranchStockAvailability, listProductBranchAvailability() (+5 more)

### Community 30 - "Community 30"
Cohesion: 0.18
Nodes (4): LogisticProvider, pickNumber(), pickString(), TembusAggregatorProvider

### Community 31 - "Community 31"
Cohesion: 0.26
Nodes (13): checkoutRoutes, addCartItem(), calculateShippingRates(), Cart, CartItem, clearCart(), getCart(), memoryCarts (+5 more)

### Community 32 - "Community 32"
Cohesion: 0.21
Nodes (14): categories, order_items, orders, products, promo_usages, promos, public.categories, public.orders (+6 more)

### Community 33 - "Community 33"
Cohesion: 0.25
Nodes (10): isFeatureEnabled(), featureGate(), promoSchema, validatePromoSchema, ApiError, ErrorCode, fail(), ok() (+2 more)

### Community 34 - "Community 34"
Cohesion: 0.24
Nodes (10): CartTotals, computeCartTotals(), ComputeTotalsInput, DiscountType, evaluatePromo(), PromoEvaluation, PromoRejection, PromoRule (+2 more)

### Community 35 - "Community 35"
Cohesion: 0.17
Nodes (9): Address, Dimensions, LogisticGatewayError, LogisticMode, LogisticWebhookEvent, ParcelItem, WebhookVerificationInput, rateParams (+1 more)

### Community 36 - "Community 36"
Cohesion: 0.23
Nodes (8): getShowAggregatorWithinRadius(), categories, OrderItemDraft, checkoutSchema, loginSchema, orderSchema, productSchema, registerSchema

### Community 37 - "Community 37"
Cohesion: 0.30
Nodes (10): clientIp(), consumeRateLimit(), correlationIdMiddleware(), RATE_LIMITS, rateLimiter(), RateLimitResult, RateLimitRule, RateLimitScope (+2 more)

### Community 38 - "Community 38"
Cohesion: 0.18
Nodes (6): BranchDashboardBody, BranchDashboardError, BranchDashboardReport, buildBranchDashboard(), round2(), branch

### Community 39 - "Community 39"
Cohesion: 0.27
Nodes (1): LogisticAggregator

### Community 40 - "Community 40"
Cohesion: 0.24
Nodes (9): app, readOrder(), readShipment(), rowsOf(), RUN_ID, seedOrder(), server, stub (+1 more)

### Community 41 - "Community 41"
Cohesion: 0.31
Nodes (9): canTransition(), isOrderStatus(), isTerminal(), nextStatuses(), ORDER_TRANSITIONS, OrderStatus, TERMINAL_STATUSES, TransitionResult (+1 more)

### Community 42 - "Community 42"
Cohesion: 0.24
Nodes (7): AdminAlert, AlertOptions, buildAdminAlerts(), classifyStock(), escapeCsvValue(), unsupportedFormatError(), products

### Community 43 - "Community 43"
Cohesion: 0.31
Nodes (6): buildExpiredPaymentDetails(), ExpiredOrder, expirePendingOrders(), isPaymentExpired(), resolvePaymentExpiry(), now

### Community 44 - "Community 44"
Cohesion: 0.22
Nodes (6): BranchAnalyticsError, branches, lowStock, orderBranches, refunds, sales

### Community 45 - "Community 45"
Cohesion: 0.32
Nodes (5): app, readOrder(), rowsOf(), seedOrder(), server

### Community 46 - "Community 46"
Cohesion: 0.43
Nodes (6): buildChartSeries(), ChartSeries, DailyPoint, fillDailySeries(), isoDay(), db

### Community 47 - "Community 47"
Cohesion: 0.43
Nodes (5): branchIdOf(), BranchScopeDecision, BranchScopeDenialCode, resolveBranchAccess(), ScopeUser

### Community 48 - "Community 48"
Cohesion: 0.29
Nodes (2): OrderSourceError, ShippingOption

### Community 49 - "Community 49"
Cohesion: 0.38
Nodes (3): logger, logHttpRequest(), requestLogger()

### Community 50 - "Community 50"
Cohesion: 0.40
Nodes (2): socialAuthSchema, SocialAuthService

### Community 51 - "Community 51"
Cohesion: 0.33
Nodes (2): allowUnsignedWebhook(), PaymentGatewayManager

### Community 52 - "Community 52"
Cohesion: 0.33
Nodes (3): results, stamp, today

### Community 53 - "Community 53"
Cohesion: 0.53
Nodes (4): formatOrderNumber(), orderNumberPrefix(), parseOrderNumber(), date

### Community 54 - "Community 54"
Cohesion: 0.80
Nodes (4): inventory_logs, product_variants, products, users

### Community 55 - "Community 55"
Cohesion: 0.60
Nodes (4): notification_preferences, notification_templates, notifications, users

### Community 56 - "Community 56"
Cohesion: 0.70
Nodes (4): product_variants, stock_transfers, store_locations, users

### Community 57 - "Community 57"
Cohesion: 0.83
Nodes (3): branch_inventory, product_variants, store_locations

### Community 58 - "Community 58"
Cohesion: 0.50
Nodes (2): app, server

## Knowledge Gaps
- **232 isolated node(s):** `categories`, `promos`, `settings`, `store_locations`, `users` (+227 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 39`** (1 nodes): `LogisticAggregator`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (2 nodes): `OrderSourceError`, `ShippingOption`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (2 nodes): `socialAuthSchema`, `SocialAuthService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (2 nodes): `allowUnsignedWebhook()`, `PaymentGatewayManager`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (2 nodes): `app`, `server`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `db` connect `Community 46` to `Community 42`, `Community 24`, `Community 14`, `Community 50`, `Community 29`, `Community 2`, `Community 3`, `Community 11`, `Community 17`, `Community 12`, `Community 0`, `Community 10`, `Community 13`, `Community 9`, `Community 18`, `Community 23`, `Community 1`, `Community 43`, `Community 4`, `Community 5`, `Community 36`, `Community 31`, `Community 6`, `Community 33`, `Community 7`, `Community 15`, `Community 19`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `TembusOnDemandProvider` connect `Community 27` to `Community 9`, `Community 20`, `Community 35`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `TembusAggregatorProvider` connect `Community 30` to `Community 9`, `Community 20`, `Community 35`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `categories`, `promos`, `settings` to the rest of the system?**
  _232 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06252587991718427 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06533575317604355 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06397306397306397 - nodes in this community are weakly interconnected._