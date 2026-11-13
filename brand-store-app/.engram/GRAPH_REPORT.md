# Graph Report - .  (2026-11-12)

## Corpus Check
- 163 files · ~85,570 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1007 nodes · 2431 edges · 50 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 721 · imports: 633 · imports_from: 313 · calls: 256 · MODIFIES: 238 · ON_BRANCH: 96 · method: 78 · references: 49 · PARENT_OF: 34 · implements: 5 · re_exports: 4 · inherits: 3 · cites: 1


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 163 · Candidates: 430
- Excluded: 4 untracked · 20618 ignored · 2 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `2c5668c`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `db` - 37 edges
2. `authMiddleware()` - 20 edges
3. `TembusOnDemandProvider` - 18 edges
4. `TembusAggregatorProvider` - 17 edges
5. `unifiedConfig` - 16 edges
6. `adminOnlyMiddleware()` - 16 edges
7. `orders` - 15 edges
8. `products` - 13 edges
9. `LogisticAggregator` - 13 edges
10. `users` - 12 edges

## Surprising Connections (you probably didn't know these)
- `assertBranchCanFulfill()` --calls--> `OrderSourceError`  [EXTRACTED]
  src/services/branch/orderSourceService.ts → src/services/branch/orderSourceService.ts  _Bridges community 21 → community 25_
- `d4f150d chore: restore recovered application files` --ON_BRANCH--> `restore-recovered-files`  [EXTRACTED]
  git → git  _Bridges community 4 → community 14_
- `getShowAggregatorWithinRadius()` --calls--> `getSettingValue()`  [EXTRACTED]
  src/services/config/settings.ts → src/services/config/settings.ts  _Bridges community 2 → community 5_
- `isFeatureEnabled()` --calls--> `getFeatureFlags()`  [EXTRACTED]
  src/services/config/settings.ts → src/services/config/settings.ts  _Bridges community 11 → community 5_
- `d4f150d chore: restore recovered application files` --ON_BRANCH--> `restore-recovered-files`  [EXTRACTED]
  git → git  _Bridges community 4 → community 22_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (53): adjustBranchStock(), AdjustBranchStockInput, BranchInventoryItem, ensureBranchRow(), listBranchInventory(), listBranchInventoryLogs(), syncVariantAggregate(), applyRelease() (+45 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (47): notificationPreferences, notificationTemplates, userDevices, buildDeepLink(), ChannelDecision, decideChannels(), DEFAULT_PREFERENCES, DEFAULT_TEMPLATES (+39 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (38): logger, logHttpRequest(), getShowAggregatorWithinRadius(), categories, orderItems, requestLogger(), clientIp(), consumeRateLimit() (+30 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (40): branchIdOf(), BranchScopeDecision, BranchScopeDenialCode, resolveBranchAccess(), ScopeUser, refunds, buildFinanceCsv(), computeFinancialSummary() (+32 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (17): d4f150d chore: restore recovered application files, d4f150d chore: restore recovered application files, orders, shipments, admin_logs, users, banners, pages (+9 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (30): BrandProfile, brandProfileSchema, ConfigError, DEFAULT_FEATURE_FLAGS, featureFlagsSchema, getBrandProfile(), getFeatureFlags(), getMaintenanceMode() (+22 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (30): reviewHelpfulVotes, reviewReports, reviews, canWriteReview(), createReview(), hasPurchasedProduct(), helpfulCountsFor(), isPublicReview() (+22 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (27): assembleBranches(), AssembleBranchesOptions, BranchAvailability, BranchAvailabilityOptions, BranchAvailabilityResult, BranchAvailabilityRow, BranchStockAvailability, listProductBranchAvailability() (+19 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (13): ManualBankProvider, PaymentProvider, ENABLED_PAYMENTS, MidtransOptions, MidtransProvider, PaymentGatewayError, PaymentProvider, paymentManager (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (23): bannerSchema, BannerWindow, ContentError, createBanner(), deleteBanner(), isBannerLive(), listAllBanners(), listPublicBanners() (+15 more)

### Community 10 - "Community 10"
Cohesion: 0.13
Nodes (21): exportProducts(), buildPageSeo(), buildProductSeo(), clampText(), DEFAULT_SITE, firstImage(), getPageSeo(), getProductSeo() (+13 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (20): isFeatureEnabled(), featureGate(), promoSchema, validatePromoSchema, CartTotals, computeCartTotals(), ComputeTotalsInput, DiscountType (+12 more)

### Community 12 - "Community 12"
Cohesion: 0.10
Nodes (24): adminLogs, cartItems, carts, flashSaleItems, flashSales, inventoryLogs, orderDisputes, orderLogs (+16 more)

### Community 13 - "Community 13"
Cohesion: 0.13
Nodes (23): maxDays(), ProviderDescriptor, RateComparisonEntry, ShippingService, Address, CreateShipmentParams, Dimensions, LogisticMode (+15 more)

### Community 14 - "Community 14"
Cohesion: 0.22
Nodes (26): backup/pre-secret-clean-main, backup/pre-secret-clean-recovery, main, rescue-recovered-15020f0, restore-recovered-files, sanitized-main, 0de5313 feat(branch): fondasi multi cabang BR-001..BR-004 (schema, scoping, stok per cabang), 15020f0 chore(sync): sync remote changes and finalize push notification mock (+18 more)

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
Cohesion: 0.16
Nodes (13): unifiedConfig, client, closeDatabase(), pingDatabase(), ARGON2_OPTIONS, defaultSettings(), seed(), buildExpiredPaymentDetails() (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.16
Nodes (17): isValidPhone(), maskPhone(), normalizePhoneNumber(), phoneSchema, readSmsConfig(), renderOtpMessage(), selectSmsProvider(), sendOtpSms() (+9 more)

### Community 20 - "Community 20"
Cohesion: 0.20
Nodes (13): AdminActionInput, isUuid(), listAdminActions(), recordAdminAction(), ExportType, AdminUserError, countAdmins(), getCustomerDetail() (+5 more)

### Community 21 - "Community 21"
Cohesion: 0.16
Nodes (17): assertBranchCanFulfill(), assertFulfillmentMode(), branchSellableStock(), BranchShipmentItem, BranchShipmentPlan, BranchSnapshot, BranchSnapshotInput, BranchTaggedItem (+9 more)

### Community 22 - "Community 22"
Cohesion: 0.36
Nodes (18): backup/pre-secret-clean-main, backup/pre-secret-clean-recovery, main, rescue-recovered-15020f0, restore-recovered-files, sanitized-main, 15020f0 chore(sync): sync remote changes and finalize push notification mock, 3364f6a feat(notifications): add mock push notification service and update checklist (+10 more)

### Community 23 - "Community 23"
Cohesion: 0.16
Nodes (11): closeRedis(), ensureRedisConnected(), getRedisClient(), redisPing(), createApp(), app, ip(), request() (+3 more)

### Community 24 - "Community 24"
Cohesion: 0.22
Nodes (4): LogisticProvider, pickNumber(), pickString(), TembusOnDemandProvider

### Community 25 - "Community 25"
Cohesion: 0.16
Nodes (11): OrderSourceError, getDefaultStoreLocation(), getStoreLocationById(), orders, shipments, RateCalculationParams, TrackingInfo, createShipmentForOrder() (+3 more)

### Community 26 - "Community 26"
Cohesion: 0.18
Nodes (4): LogisticProvider, pickNumber(), pickString(), TembusAggregatorProvider

### Community 27 - "Community 27"
Cohesion: 0.26
Nodes (13): checkoutRoutes, addCartItem(), calculateShippingRates(), Cart, CartItem, clearCart(), getCart(), memoryCarts (+5 more)

### Community 28 - "Community 28"
Cohesion: 0.21
Nodes (14): categories, order_items, orders, products, promo_usages, promos, public.categories, public.orders (+6 more)

### Community 29 - "Community 29"
Cohesion: 0.37
Nodes (10): clearFailureCache(), clearFailures(), failureKey(), getLockState(), lockKey(), LockState, memoryFailures, memoryKey() (+2 more)

### Community 30 - "Community 30"
Cohesion: 0.23
Nodes (9): FailureResolution, FailureResolutionAction, isTerminalShipmentStatus(), normalizeShipmentStatus(), OrderStatus, RAW_STATUS_MAP, resolveDeliveryFailure(), shipmentStatusToOrderStatus() (+1 more)

### Community 31 - "Community 31"
Cohesion: 0.27
Nodes (1): LogisticAggregator

### Community 32 - "Community 32"
Cohesion: 0.24
Nodes (9): app, readOrder(), readShipment(), rowsOf(), RUN_ID, seedOrder(), server, stub (+1 more)

### Community 33 - "Community 33"
Cohesion: 0.31
Nodes (9): canTransition(), isOrderStatus(), isTerminal(), nextStatuses(), ORDER_TRANSITIONS, OrderStatus, TERMINAL_STATUSES, TransitionResult (+1 more)

### Community 34 - "Community 34"
Cohesion: 0.24
Nodes (7): AdminAlert, AlertOptions, buildAdminAlerts(), classifyStock(), escapeCsvValue(), unsupportedFormatError(), products

### Community 35 - "Community 35"
Cohesion: 0.32
Nodes (3): EventEmitter, RealtimeHub, realtimeRoutes

### Community 36 - "Community 36"
Cohesion: 0.32
Nodes (5): app, readOrder(), rowsOf(), seedOrder(), server

### Community 37 - "Community 37"
Cohesion: 0.43
Nodes (6): buildChartSeries(), ChartSeries, DailyPoint, fillDailySeries(), isoDay(), db

### Community 38 - "Community 38"
Cohesion: 0.40
Nodes (2): socialAuthSchema, SocialAuthService

### Community 39 - "Community 39"
Cohesion: 0.33
Nodes (3): LogisticGatewayError, rateParams, Recorded

### Community 40 - "Community 40"
Cohesion: 0.33
Nodes (2): allowUnsignedWebhook(), PaymentGatewayManager

### Community 41 - "Community 41"
Cohesion: 0.33
Nodes (3): results, stamp, today

### Community 42 - "Community 42"
Cohesion: 0.53
Nodes (4): formatOrderNumber(), orderNumberPrefix(), parseOrderNumber(), date

### Community 43 - "Community 43"
Cohesion: 0.80
Nodes (4): inventory_logs, product_variants, products, users

### Community 44 - "Community 44"
Cohesion: 0.60
Nodes (4): notification_preferences, notification_templates, notifications, users

### Community 45 - "Community 45"
Cohesion: 0.40
Nodes (2): app, server

### Community 46 - "Community 46"
Cohesion: 0.40
Nodes (2): app, server

### Community 47 - "Community 47"
Cohesion: 0.83
Nodes (3): branch_inventory, product_variants, store_locations

### Community 48 - "Community 48"
Cohesion: 0.50
Nodes (2): app, server

### Community 49 - "Community 49"
Cohesion: 1.00
Nodes (2): buildLogisticAggregator(), ensureLogisticProvidersRegistered()

## Knowledge Gaps
- **199 isolated node(s):** `categories`, `promos`, `settings`, `store_locations`, `users` (+194 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 31`** (1 nodes): `LogisticAggregator`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (2 nodes): `socialAuthSchema`, `SocialAuthService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (2 nodes): `allowUnsignedWebhook()`, `PaymentGatewayManager`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (2 nodes): `app`, `server`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (2 nodes): `app`, `server`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (2 nodes): `app`, `server`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (2 nodes): `buildLogisticAggregator()`, `ensureLogisticProvidersRegistered()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `db` connect `Community 37` to `Community 34`, `Community 20`, `Community 38`, `Community 7`, `Community 0`, `Community 21`, `Community 17`, `Community 10`, `Community 5`, `Community 9`, `Community 18`, `Community 3`, `Community 25`, `Community 1`, `Community 4`, `Community 6`, `Community 2`, `Community 27`, `Community 11`, `Community 12`, `Community 15`, `Community 19`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `TembusOnDemandProvider` connect `Community 24` to `Community 49`, `Community 13`, `Community 39`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `TembusAggregatorProvider` connect `Community 26` to `Community 49`, `Community 13`, `Community 39`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `categories`, `promos`, `settings` to the rest of the system?**
  _199 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06946386946386947 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06641604010025062 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07058823529411765 - nodes in this community are weakly interconnected._