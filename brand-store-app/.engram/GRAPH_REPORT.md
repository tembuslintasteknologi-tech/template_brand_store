# Graph Report - .  (2026-11-13)

## Corpus Check
- 176 files · ~101,876 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1157 nodes · 2823 edges · 63 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 850 · imports: 770 · imports_from: 371 · calls: 306 · MODIFIES: 238 · ON_BRANCH: 101 · method: 81 · references: 52 · PARENT_OF: 39 · implements: 5 · inherits: 5 · re_exports: 4 · cites: 1


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 176 · Candidates: 467
- Excluded: 2 untracked · 20618 ignored · 2 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `a1ab452`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `db` - 43 edges
2. `authMiddleware()` - 21 edges
3. `orders` - 18 edges
4. `TembusOnDemandProvider` - 18 edges
5. `TembusAggregatorProvider` - 17 edges
6. `unifiedConfig` - 16 edges
7. `adminOnlyMiddleware()` - 16 edges
8. `products` - 15 edges
9. `OrderSourceError` - 13 edges
10. `StockTransferError` - 13 edges

## Surprising Connections (you probably didn't know these)
- `assertBranchCanFulfill()` --calls--> `OrderSourceError`  [EXTRACTED]
  src/services/branch/orderSourceService.ts → src/services/branch/orderSourceService.ts  _Bridges community 10 → community 48_
- `d4f150d chore: restore recovered application files` --ON_BRANCH--> `restore-recovered-files`  [EXTRACTED]
  git → git  _Bridges community 4 → community 8_
- `getShowAggregatorWithinRadius()` --calls--> `getSettingValue()`  [EXTRACTED]
  src/services/config/settings.ts → src/services/config/settings.ts  _Bridges community 37 → community 0_
- `isFeatureEnabled()` --calls--> `getFeatureFlags()`  [EXTRACTED]
  src/services/config/settings.ts → src/services/config/settings.ts  _Bridges community 33 → community 0_
- `d4f150d chore: restore recovered application files` --ON_BRANCH--> `restore-recovered-files`  [EXTRACTED]
  git → git  _Bridges community 4 → community 25_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (55): assertBranchDeactivatable(), assertBranchDeletable(), assertOndemandUsable(), BranchValidationCode, BranchValidationError, coerceCoordinate(), CoordinateKind, Coordinates (+47 more)

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
Cohesion: 0.09
Nodes (17): d4f150d chore: restore recovered application files, d4f150d chore: restore recovered application files, orders, shipments, admin_logs, users, banners, pages (+9 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (30): reviewHelpfulVotes, reviewReports, reviews, canWriteReview(), createReview(), hasPurchasedProduct(), helpfulCountsFor(), isPublicReview() (+22 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (30): userAddresses, Coordinates, DELIVERY_MODES, DeliveryMode, DeliveryModeInput, DeliveryModeReason, DeliveryModeResult, haversineDistanceKm() (+22 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (13): ManualBankProvider, PaymentProvider, ENABLED_PAYMENTS, MidtransOptions, MidtransProvider, PaymentGatewayError, PaymentProvider, paymentManager (+5 more)

### Community 8 - "Community 8"
Cohesion: 0.17
Nodes (31): backup/pre-secret-clean-main, backup/pre-secret-clean-recovery, main, rescue-recovered-15020f0, restore-recovered-files, sanitized-main, 0bc44bb feat(BR-013): dashboard cabang, 0de5313 feat(branch): fondasi multi cabang BR-001..BR-004 (schema, scoping, stok per cabang) (+23 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (23): bannerSchema, BannerWindow, ContentError, createBanner(), deleteBanner(), isBannerLive(), listAllBanners(), listPublicBanners() (+15 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (25): assertBranchCanFulfill(), assertFulfillmentMode(), branchSellableStock(), BranchShipmentItem, BranchShipmentPlan, BranchSnapshot, BranchSnapshotInput, BranchTaggedItem (+17 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (21): exportProducts(), buildPageSeo(), buildProductSeo(), clampText(), DEFAULT_SITE, firstImage(), getPageSeo(), getProductSeo() (+13 more)

### Community 12 - "Community 12"
Cohesion: 0.14
Nodes (20): notifications, wishlists, wishlistRoutes, addToWishlist(), BackInStockInput, dedupeProductIds(), deliverWishlistAlert(), discountPercent() (+12 more)

### Community 13 - "Community 13"
Cohesion: 0.17
Nodes (25): cart_items, carts, flash_sale_items, flash_sales, order_disputes, order_logs, orders, payment_webhooks (+17 more)

### Community 14 - "Community 14"
Cohesion: 0.13
Nodes (21): buildCsv(), buildExport(), ExportColumn, ExportFormat, ExportResult, buildProductImportTemplate(), BulkError, importProducts() (+13 more)

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (19): buildFinanceCsv(), computeFinancialSummary(), computeMargin(), EXCLUDED_STATUSES, FinanceError, FinanceOrderRow, FinanceRefundRow, FinancialSummary (+11 more)

### Community 16 - "Community 16"
Cohesion: 0.16
Nodes (19): maxDays(), ProviderDescriptor, RateComparisonEntry, ShippingService, LogisticProvider, PickupParams, PickupResult, RateCalculationParams (+11 more)

### Community 17 - "Community 17"
Cohesion: 0.16
Nodes (17): isValidPhone(), maskPhone(), normalizePhoneNumber(), phoneSchema, readSmsConfig(), renderOtpMessage(), selectSmsProvider(), sendOtpSms() (+9 more)

### Community 18 - "Community 18"
Cohesion: 0.16
Nodes (11): unifiedConfig, client, pingDatabase(), buildLogisticAggregator(), ensureLogisticProvidersRegistered(), buildExpiredPaymentDetails(), ExpiredOrder, expirePendingOrders() (+3 more)

### Community 19 - "Community 19"
Cohesion: 0.14
Nodes (17): adminRoutes, analyticsRoutes, authRoutes, logisticsRoutes, logisticsWebhookRoutes, notificationAdminRoutes, notificationRoutes, orderRoutes (+9 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (14): shipments, CreateShipmentParams, ShipmentStatus, createShipmentForOrder(), CreateShipmentInput, persistTracking(), syncOrderFromShipment(), FailureResolution (+6 more)

### Community 21 - "Community 21"
Cohesion: 0.20
Nodes (13): AdminActionInput, isUuid(), listAdminActions(), recordAdminAction(), ExportType, AdminUserError, countAdmins(), getCustomerDetail() (+5 more)

### Community 22 - "Community 22"
Cohesion: 0.16
Nodes (12): closeRedis(), ensureRedisConnected(), getRedisClient(), redisPing(), closeDatabase(), createApp(), app, ip() (+4 more)

### Community 23 - "Community 23"
Cohesion: 0.13
Nodes (16): adminLogs, cartItems, carts, flashSaleItems, flashSales, orderDisputes, orderLogs, payments (+8 more)

### Community 24 - "Community 24"
Cohesion: 0.18
Nodes (15): BranchAnalyticsEntry, BranchAnalyticsError, BranchAnalyticsErrorCode, BranchAnalyticsReport, BranchAnalyticsRollup, buildBranchAnalytics(), BuildBranchAnalyticsInput, isRevenue() (+7 more)

### Community 25 - "Community 25"
Cohesion: 0.36
Nodes (18): backup/pre-secret-clean-main, backup/pre-secret-clean-recovery, main, rescue-recovered-15020f0, restore-recovered-files, sanitized-main, 15020f0 chore(sync): sync remote changes and finalize push notification mock, 3364f6a feat(notifications): add mock push notification service and update checklist (+10 more)

### Community 26 - "Community 26"
Cohesion: 0.22
Nodes (4): LogisticProvider, pickNumber(), pickString(), TembusOnDemandProvider

### Community 27 - "Community 27"
Cohesion: 0.24
Nodes (16): adminOnlyMiddleware(), authMiddleware(), BranchScopeOptions, clearRevocationCache(), isTokenRevoked(), requireRole(), revokeToken(), signAccessToken() (+8 more)

### Community 28 - "Community 28"
Cohesion: 0.15
Nodes (13): assembleBranches(), AssembleBranchesOptions, BranchAvailability, BranchAvailabilityOptions, BranchAvailabilityResult, BranchAvailabilityRow, BranchStockAvailability, listProductBranchAvailability() (+5 more)

### Community 29 - "Community 29"
Cohesion: 0.18
Nodes (4): LogisticProvider, pickNumber(), pickString(), TembusAggregatorProvider

### Community 30 - "Community 30"
Cohesion: 0.16
Nodes (14): BranchRef, LowStockItem, LowStockRow, OrderBranchLine, SaleLine, ActiveReservationRow, BranchDashboardBody, BranchDashboardError (+6 more)

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
Cohesion: 0.37
Nodes (10): clearFailureCache(), clearFailures(), failureKey(), getLockState(), lockKey(), LockState, memoryFailures, memoryKey() (+2 more)

### Community 37 - "Community 37"
Cohesion: 0.23
Nodes (8): getShowAggregatorWithinRadius(), categories, OrderItemDraft, checkoutSchema, loginSchema, orderSchema, productSchema, registerSchema

### Community 38 - "Community 38"
Cohesion: 0.26
Nodes (11): branchInventory, productVariants, settings, ARGON2_OPTIONS, defaultSettings(), ensureCatalog(), ensureInventory(), ensureLocation() (+3 more)

### Community 39 - "Community 39"
Cohesion: 0.30
Nodes (10): clientIp(), consumeRateLimit(), correlationIdMiddleware(), RATE_LIMITS, rateLimiter(), RateLimitResult, RateLimitRule, RateLimitScope (+2 more)

### Community 40 - "Community 40"
Cohesion: 0.27
Nodes (1): LogisticAggregator

### Community 41 - "Community 41"
Cohesion: 0.24
Nodes (9): app, readOrder(), readShipment(), rowsOf(), RUN_ID, seedOrder(), server, stub (+1 more)

### Community 42 - "Community 42"
Cohesion: 0.31
Nodes (9): canTransition(), isOrderStatus(), isTerminal(), nextStatuses(), ORDER_TRANSITIONS, OrderStatus, TERMINAL_STATUSES, TransitionResult (+1 more)

### Community 43 - "Community 43"
Cohesion: 0.24
Nodes (7): AdminAlert, AlertOptions, buildAdminAlerts(), classifyStock(), escapeCsvValue(), unsupportedFormatError(), products

### Community 44 - "Community 44"
Cohesion: 0.32
Nodes (3): EventEmitter, RealtimeHub, realtimeRoutes

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
Cohesion: 0.29
Nodes (5): branches, lowStock, orderBranches, refunds, sales

### Community 51 - "Community 51"
Cohesion: 0.40
Nodes (2): socialAuthSchema, SocialAuthService

### Community 52 - "Community 52"
Cohesion: 0.33
Nodes (2): allowUnsignedWebhook(), PaymentGatewayManager

### Community 53 - "Community 53"
Cohesion: 0.33
Nodes (3): results, stamp, today

### Community 54 - "Community 54"
Cohesion: 0.53
Nodes (4): formatOrderNumber(), orderNumberPrefix(), parseOrderNumber(), date

### Community 55 - "Community 55"
Cohesion: 0.80
Nodes (4): inventory_logs, product_variants, products, users

### Community 56 - "Community 56"
Cohesion: 0.60
Nodes (4): notification_preferences, notification_templates, notifications, users

### Community 57 - "Community 57"
Cohesion: 0.70
Nodes (4): product_variants, stock_transfers, store_locations, users

### Community 58 - "Community 58"
Cohesion: 0.40
Nodes (2): app, server

### Community 59 - "Community 59"
Cohesion: 0.40
Nodes (2): app, server

### Community 60 - "Community 60"
Cohesion: 0.40
Nodes (1): branch

### Community 61 - "Community 61"
Cohesion: 0.83
Nodes (3): branch_inventory, product_variants, store_locations

### Community 62 - "Community 62"
Cohesion: 0.50
Nodes (2): app, server

## Knowledge Gaps
- **228 isolated node(s):** `categories`, `promos`, `settings`, `store_locations`, `users` (+223 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 40`** (1 nodes): `LogisticAggregator`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (2 nodes): `OrderSourceError`, `ShippingOption`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (2 nodes): `socialAuthSchema`, `SocialAuthService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (2 nodes): `allowUnsignedWebhook()`, `PaymentGatewayManager`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (2 nodes): `app`, `server`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (2 nodes): `app`, `server`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `branch`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (2 nodes): `app`, `server`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `db` connect `Community 46` to `Community 43`, `Community 21`, `Community 24`, `Community 51`, `Community 28`, `Community 30`, `Community 2`, `Community 3`, `Community 10`, `Community 14`, `Community 11`, `Community 0`, `Community 9`, `Community 18`, `Community 38`, `Community 15`, `Community 20`, `Community 1`, `Community 4`, `Community 5`, `Community 37`, `Community 31`, `Community 33`, `Community 6`, `Community 12`, `Community 17`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `TembusOnDemandProvider` connect `Community 26` to `Community 18`, `Community 16`, `Community 35`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `TembusAggregatorProvider` connect `Community 29` to `Community 18`, `Community 16`, `Community 35`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `categories`, `promos`, `settings` to the rest of the system?**
  _228 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.0639386189258312 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06641604010025062 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06397306397306397 - nodes in this community are weakly interconnected._