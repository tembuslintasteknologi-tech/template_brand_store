# Graph Report - .  (2026-11-17)

## Corpus Check
- 204 files · ~137,732 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1503 nodes · 3651 edges · 67 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 1155 · imports: 1040 · calls: 455 · imports_from: 438 · MODIFIES: 238 · ON_BRANCH: 109 · method: 87 · references: 63 · PARENT_OF: 47 · inherits: 9 · implements: 5 · re_exports: 4 · cites: 1


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 204 · Candidates: 544
- Excluded: 15 untracked · 20618 ignored · 2 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `663bbde`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `db` - 47 edges
2. `authMiddleware()` - 26 edges
3. `orders` - 20 edges
4. `adminOnlyMiddleware()` - 20 edges
5. `unifiedConfig` - 19 edges
6. `TembusOnDemandProvider` - 18 edges
7. `TembusAggregatorProvider` - 17 edges
8. `products` - 16 edges
9. `WalletError` - 16 edges
10. `ReferralError` - 15 edges

## Surprising Connections (you probably didn't know these)
- `assertBranchCanFulfill()` --calls--> `OrderSourceError`  [EXTRACTED]
  src/services/branch/orderSourceService.ts → src/services/branch/orderSourceService.ts  _Bridges community 16 → community 38_
- `d4f150d chore: restore recovered application files` --ON_BRANCH--> `restore-recovered-files`  [EXTRACTED]
  git → git  _Bridges community 6 → community 10_
- `addFlashSaleItem()` --calls--> `assertItemNotDuplicated()`  [EXTRACTED]
  src/services/promo/flashSaleRepository.ts → src/services/promo/flashSaleRepository.ts  _Bridges community 35 → community 29_
- `d4f150d chore: restore recovered application files` --ON_BRANCH--> `restore-recovered-files`  [EXTRACTED]
  git → git  _Bridges community 6 → community 30_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (64): listBranchInventory(), listBranchInventoryLogs(), assertBranchDeactivatable(), assertBranchDeletable(), assertOndemandUsable(), BranchValidationCode, BranchValidationError, coerceCoordinate() (+56 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (54): BranchAnalyticsEntry, BranchAnalyticsError, BranchAnalyticsErrorCode, BranchAnalyticsReport, BranchAnalyticsRollup, BranchRef, buildBranchAnalytics(), BuildBranchAnalyticsInput (+46 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (55): loyaltyAccounts, loyaltyTransactions, adjustPoints(), AdjustPointsInput, createAccount(), earnPoints(), EarnPointsInput, EarnPointsResult (+47 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (54): referralCodes, referrals, AdminReferralView, assertQualifyingOrder(), awardSide(), cancelReferral(), claimReferral(), ClaimReferralInput (+46 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (47): notificationPreferences, notificationTemplates, userDevices, buildDeepLink(), ChannelDecision, decideChannels(), DEFAULT_PREFERENCES, DEFAULT_TEMPLATES (+39 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (46): adjustBranchStock(), AdjustBranchStockInput, BranchInventoryItem, ensureBranchRow(), syncVariantAggregate(), assertReservationInput(), BranchReleaseResult, BranchReservationResult (+38 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (22): socialAuthSchema, SocialAuthService, d4f150d chore: restore recovered application files, d4f150d chore: restore recovered application files, orders, shipments, admin_logs, users (+14 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (30): unifiedConfig, client, closeDatabase(), pingDatabase(), ARGON2_OPTIONS, defaultSettings(), ensureCatalog(), ensureInventory() (+22 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (38): BrandProfile, brandProfileSchema, cartAbandonmentSettingSchema, chatHoursSettingSchema, ConfigError, DEFAULT_FEATURE_FLAGS, featureFlagsSchema, getBrandProfile() (+30 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (39): aggregateBannerMetrics(), BANNER_AUDIENCES, BANNER_EVENT_TYPES, BannerAnalyticsRow, BannerAudience, bannerEventSchema, BannerEventType, BannerMetrics (+31 more)

### Community 10 - "Community 10"
Cohesion: 0.13
Nodes (39): backup/pre-secret-clean-main, backup/pre-secret-clean-recovery, main, rescue-recovered-15020f0, restore-recovered-files, sanitized-main, 020d2b2 docs(checklist): audit status Phase 3 Advanced, 4 baris partial jadi [~] dan rekap dihitung ulang, 0bc44bb feat(BR-013): dashboard cabang (+31 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (33): wallets, walletTransactions, adjustSchema, creditSchema, paySchema, previewSchema, programSchema, walletAdminRoutes (+25 more)

### Community 12 - "Community 12"
Cohesion: 0.10
Nodes (30): reviewHelpfulVotes, reviewReports, reviews, canWriteReview(), createReview(), hasPurchasedProduct(), helpfulCountsFor(), isPublicReview() (+22 more)

### Community 13 - "Community 13"
Cohesion: 0.12
Nodes (30): assertFlashSaleDiscount(), assertFlashSaleItemInput(), assertFlashSalePerUserLimit(), assertFlashSaleStock(), assertFlashSaleTitle(), assertFlashSaleWindow(), evaluateFlashSalePurchase(), FLASH_SALE_DISCOUNT_TYPES (+22 more)

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (13): ManualBankProvider, PaymentProvider, ENABLED_PAYMENTS, MidtransOptions, MidtransProvider, PaymentGatewayError, PaymentProvider, paymentManager (+5 more)

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (21): categories, products, EventEmitter, RealtimeHub, OrderItemDraft, base64UrlDecode(), base64UrlEncode(), buildCursorPage() (+13 more)

### Community 16 - "Community 16"
Cohesion: 0.12
Nodes (25): assertBranchCanFulfill(), assertFulfillmentMode(), branchSellableStock(), BranchShipmentItem, BranchShipmentPlan, BranchSnapshot, BranchSnapshotInput, BranchTaggedItem (+17 more)

### Community 17 - "Community 17"
Cohesion: 0.13
Nodes (21): exportProducts(), buildPageSeo(), buildProductSeo(), clampText(), DEFAULT_SITE, firstImage(), getPageSeo(), getProductSeo() (+13 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (20): closeRedis(), ensureRedisConnected(), getRedisClient(), redisPing(), clientIp(), consumeRateLimit(), correlationIdMiddleware(), RATE_LIMITS (+12 more)

### Community 19 - "Community 19"
Cohesion: 0.14
Nodes (20): notifications, wishlists, wishlistRoutes, addToWishlist(), BackInStockInput, dedupeProductIds(), deliverWishlistAlert(), discountPercent() (+12 more)

### Community 20 - "Community 20"
Cohesion: 0.12
Nodes (23): userAddresses, Coordinates, DELIVERY_MODES, DeliveryMode, DeliveryModeInput, DeliveryModeReason, DeliveryModeResult, haversineDistanceKm() (+15 more)

### Community 21 - "Community 21"
Cohesion: 0.17
Nodes (25): cart_items, carts, flash_sale_items, flash_sales, order_disputes, order_logs, orders, payment_webhooks (+17 more)

### Community 22 - "Community 22"
Cohesion: 0.13
Nodes (21): buildCsv(), buildExport(), ExportColumn, ExportFormat, ExportResult, buildProductImportTemplate(), BulkError, importProducts() (+13 more)

### Community 23 - "Community 23"
Cohesion: 0.13
Nodes (19): Address, CreateShipmentParams, Dimensions, LogisticGatewayError, LogisticMode, LogisticWebhookEvent, ParcelItem, PickupParams (+11 more)

### Community 24 - "Community 24"
Cohesion: 0.16
Nodes (17): isValidPhone(), maskPhone(), normalizePhoneNumber(), phoneSchema, readSmsConfig(), renderOtpMessage(), selectSmsProvider(), sendOtpSms() (+9 more)

### Community 25 - "Community 25"
Cohesion: 0.13
Nodes (18): analyticsRoutes, authRoutes, notificationAdminRoutes, notificationRoutes, orderRoutes, paymentRoutes, productRoutes, promoRoutes (+10 more)

### Community 26 - "Community 26"
Cohesion: 0.27
Nodes (18): applyWalletDelta(), assertWalletAmount(), assertWalletBalance(), assertWalletDirection(), assertWalletPaymentPossible(), assertWalletType(), computeCashback(), DEFAULT_WALLET_PROGRAM (+10 more)

### Community 27 - "Community 27"
Cohesion: 0.17
Nodes (15): AdminActionInput, isUuid(), listAdminActions(), recordAdminAction(), ExportType, AdminUserError, countAdmins(), getCustomerDetail() (+7 more)

### Community 28 - "Community 28"
Cohesion: 0.13
Nodes (17): adminTotp, cartItems, carts, chatConversations, chatMessages, flashSaleItems, flashSalePurchases, flashSales (+9 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (18): assertItemNotDuplicated(), checkFlashSaleAvailability(), CreateFlashSaleInput, CreateFlashSaleItemInput, FlashSaleLineView, FlashSalePurchaseInput, FlashSalePurchaseResult, FlashSaleRecord (+10 more)

### Community 30 - "Community 30"
Cohesion: 0.36
Nodes (18): backup/pre-secret-clean-main, backup/pre-secret-clean-recovery, main, rescue-recovered-15020f0, restore-recovered-files, sanitized-main, 15020f0 chore(sync): sync remote changes and finalize push notification mock, 3364f6a feat(notifications): add mock push notification service and update checklist (+10 more)

### Community 31 - "Community 31"
Cohesion: 0.22
Nodes (4): LogisticProvider, pickNumber(), pickString(), TembusOnDemandProvider

### Community 32 - "Community 32"
Cohesion: 0.24
Nodes (16): adminOnlyMiddleware(), authMiddleware(), BranchScopeOptions, clearRevocationCache(), isTokenRevoked(), requireRole(), revokeToken(), signAccessToken() (+8 more)

### Community 33 - "Community 33"
Cohesion: 0.15
Nodes (13): assembleBranches(), AssembleBranchesOptions, BranchAvailability, BranchAvailabilityOptions, BranchAvailabilityResult, BranchAvailabilityRow, BranchStockAvailability, listProductBranchAvailability() (+5 more)

### Community 34 - "Community 34"
Cohesion: 0.18
Nodes (4): LogisticProvider, pickNumber(), pickString(), TembusAggregatorProvider

### Community 35 - "Community 35"
Cohesion: 0.19
Nodes (15): addFlashSaleItem(), createFlashSale(), deleteFlashSale(), getFlashSaleRecord(), getFlashSaleView(), removeFlashSaleItem(), updateFlashSale(), updateFlashSaleItem() (+7 more)

### Community 36 - "Community 36"
Cohesion: 0.18
Nodes (12): AdminAlert, AlertOptions, buildAdminAlerts(), classifyStock(), buildChartSeries(), ChartSeries, DailyPoint, fillDailySeries() (+4 more)

### Community 37 - "Community 37"
Cohesion: 0.26
Nodes (13): checkoutRoutes, addCartItem(), calculateShippingRates(), Cart, CartItem, clearCart(), getCart(), memoryCarts (+5 more)

### Community 38 - "Community 38"
Cohesion: 0.19
Nodes (9): OrderSourceError, shipments, LogisticProvider, createShipmentForOrder(), CreateShipmentInput, persistTracking(), syncOrderFromShipment(), logisticsRoutes (+1 more)

### Community 39 - "Community 39"
Cohesion: 0.21
Nodes (14): categories, order_items, orders, products, promo_usages, promos, public.categories, public.orders (+6 more)

### Community 40 - "Community 40"
Cohesion: 0.24
Nodes (10): CartTotals, computeCartTotals(), ComputeTotalsInput, DiscountType, evaluatePromo(), PromoEvaluation, PromoRejection, PromoRule (+2 more)

### Community 41 - "Community 41"
Cohesion: 0.28
Nodes (9): featureGate(), promoSchema, validatePromoSchema, ApiError, ErrorCode, fail(), ok(), requestId() (+1 more)

### Community 42 - "Community 42"
Cohesion: 0.37
Nodes (10): clearFailureCache(), clearFailures(), failureKey(), getLockState(), lockKey(), LockState, memoryFailures, memoryKey() (+2 more)

### Community 43 - "Community 43"
Cohesion: 0.23
Nodes (9): maxDays(), ProviderDescriptor, RateComparisonEntry, ShippingService, RateCalculationParams, ShippingService, TrackingInfo, resolveDeliveryFailure() (+1 more)

### Community 44 - "Community 44"
Cohesion: 0.27
Nodes (1): LogisticAggregator

### Community 45 - "Community 45"
Cohesion: 0.24
Nodes (9): app, readOrder(), readShipment(), rowsOf(), RUN_ID, seedOrder(), server, stub (+1 more)

### Community 46 - "Community 46"
Cohesion: 0.31
Nodes (9): canTransition(), isOrderStatus(), isTerminal(), nextStatuses(), ORDER_TRANSITIONS, OrderStatus, TERMINAL_STATUSES, TransitionResult (+1 more)

### Community 47 - "Community 47"
Cohesion: 0.20
Nodes (8): shippingRoutes, assembleShippingOptions(), branchAddress(), clampWeightGrams(), errorMessage(), isDeliveryMode(), listShippingOptions(), loadDestination()

### Community 48 - "Community 48"
Cohesion: 0.22
Nodes (8): ShipmentStatus, FailureResolution, FailureResolutionAction, isTerminalShipmentStatus(), normalizeShipmentStatus(), OrderStatus, RAW_STATUS_MAP, shipmentStatusToOrderStatus()

### Community 49 - "Community 49"
Cohesion: 0.32
Nodes (5): app, readOrder(), rowsOf(), seedOrder(), server

### Community 50 - "Community 50"
Cohesion: 0.43
Nodes (5): branchIdOf(), BranchScopeDecision, BranchScopeDenialCode, resolveBranchAccess(), ScopeUser

### Community 51 - "Community 51"
Cohesion: 0.38
Nodes (3): logger, logHttpRequest(), requestLogger()

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
Cohesion: 0.70
Nodes (4): flash_sale_items, flash_sale_purchases, orders, users

### Community 59 - "Community 59"
Cohesion: 0.70
Nodes (4): orders, referral_codes, referrals, users

### Community 60 - "Community 60"
Cohesion: 0.40
Nodes (3): bannerListDuration, failures, productListDuration

### Community 61 - "Community 61"
Cohesion: 0.40
Nodes (2): app, server

### Community 62 - "Community 62"
Cohesion: 0.40
Nodes (2): app, server

### Community 63 - "Community 63"
Cohesion: 0.40
Nodes (1): ShippingOption

### Community 64 - "Community 64"
Cohesion: 0.83
Nodes (3): branch_inventory, product_variants, store_locations

### Community 65 - "Community 65"
Cohesion: 1.00
Nodes (3): loyalty_accounts, loyalty_transactions, users

### Community 66 - "Community 66"
Cohesion: 0.83
Nodes (3): banner_events, banners, users

## Knowledge Gaps
- **318 isolated node(s):** `categories`, `promos`, `settings`, `store_locations`, `users` (+313 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 44`** (1 nodes): `LogisticAggregator`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (2 nodes): `allowUnsignedWebhook()`, `PaymentGatewayManager`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (2 nodes): `app`, `server`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (2 nodes): `app`, `server`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `ShippingOption`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `db` connect `Community 36` to `Community 27`, `Community 1`, `Community 6`, `Community 33`, `Community 5`, `Community 16`, `Community 0`, `Community 22`, `Community 17`, `Community 8`, `Community 9`, `Community 7`, `Community 38`, `Community 2`, `Community 4`, `Community 29`, `Community 3`, `Community 12`, `Community 37`, `Community 15`, `Community 41`, `Community 20`, `Community 11`, `Community 19`, `Community 24`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `TembusOnDemandProvider` connect `Community 31` to `Community 6`, `Community 23`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `TembusAggregatorProvider` connect `Community 34` to `Community 6`, `Community 23`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `categories`, `promos`, `settings` to the rest of the system?**
  _318 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05128205128205128 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05010351966873706 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06663141195134849 - nodes in this community are weakly interconnected._