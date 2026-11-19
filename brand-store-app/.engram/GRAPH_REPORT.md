# Graph Report - .  (2026-11-19)

## Corpus Check
- 224 files · ~163,281 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1759 nodes · 4270 edges · 76 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 1374 · imports: 1235 · calls: 577 · imports_from: 492 · MODIFIES: 238 · ON_BRANCH: 112 · method: 99 · references: 70 · PARENT_OF: 50 · inherits: 10 · implements: 5 · cites: 4 · re_exports: 4


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 224 · Candidates: 600
- Excluded: 8 untracked · 20618 ignored · 3 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `1478769`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `db` - 51 edges
2. `authMiddleware()` - 29 edges
3. `adminOnlyMiddleware()` - 21 edges
4. `orders` - 20 edges
5. `unifiedConfig` - 19 edges
6. `users` - 18 edges
7. `products` - 18 edges
8. `TembusOnDemandProvider` - 18 edges
9. `TembusAggregatorProvider` - 17 edges
10. `WalletError` - 16 edges

## Surprising Connections (you probably didn't know these)
- `assertBranchCanFulfill()` --calls--> `OrderSourceError`  [EXTRACTED]
  src/services/branch/orderSourceService.ts → src/services/branch/orderSourceService.ts  _Bridges community 21 → community 43_
- `createConversation()` --calls--> `resolveBranchForChat()`  [EXTRACTED]
  src/services/chat/chatService.ts → src/services/chat/chatService.ts  _Bridges community 38 → community 23_
- `d4f150d chore: restore recovered application files` --ON_BRANCH--> `restore-recovered-files`  [EXTRACTED]
  git → git  _Bridges community 6 → community 12_
- `addFlashSaleItem()` --calls--> `assertItemNotDuplicated()`  [EXTRACTED]
  src/services/promo/flashSaleRepository.ts → src/services/promo/flashSaleRepository.ts  _Bridges community 42 → community 33_
- `d4f150d chore: restore recovered application files` --ON_BRANCH--> `restore-recovered-files`  [EXTRACTED]
  git → git  _Bridges community 6 → community 37_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (71): wallets, walletTransactions, adminOnlyMiddleware(), featureGate(), promoSchema, validatePromoSchema, adjustSchema, creditSchema (+63 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (63): assertBranchDeactivatable(), assertBranchDeletable(), assertOndemandUsable(), BranchValidationCode, BranchValidationError, coerceCoordinate(), CoordinateKind, Coordinates (+55 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (55): BranchAnalyticsEntry, BranchAnalyticsError, BranchAnalyticsErrorCode, BranchAnalyticsReport, BranchAnalyticsRollup, BranchRef, buildBranchAnalytics(), BuildBranchAnalyticsInput (+47 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (55): loyaltyAccounts, loyaltyTransactions, adjustPoints(), AdjustPointsInput, createAccount(), earnPoints(), EarnPointsInput, EarnPointsResult (+47 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (54): referralCodes, referrals, AdminReferralView, assertQualifyingOrder(), awardSide(), cancelReferral(), claimReferral(), ClaimReferralInput (+46 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (47): notificationPreferences, notificationTemplates, userDevices, buildDeepLink(), ChannelDecision, decideChannels(), DEFAULT_PREFERENCES, DEFAULT_TEMPLATES (+39 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (23): socialAuthSchema, SocialAuthService, d4f150d chore: restore recovered application files, d4f150d chore: restore recovered application files, orders, shipments, admin_logs, users (+15 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (40): AddItemInput, addItemToCart(), CartLine, CartPersistenceError, CartView, clearCartForUser(), generateRecoveryToken(), getCartView() (+32 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (40): aggregateBannerMetrics(), BANNER_AUDIENCES, BANNER_EVENT_TYPES, BannerAnalyticsRow, BannerAudience, bannerEventSchema, BannerEventType, BannerMetrics (+32 more)

### Community 9 - "Community 9"
Cohesion: 0.10
Nodes (35): base32Decode(), base32Encode(), buildOtpauthUri(), counterToBuffer(), generateRecoveryCodes(), generateTotpSecret(), hotp(), normalizeRecoveryCode() (+27 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (30): unifiedConfig, client, closeDatabase(), pingDatabase(), ARGON2_OPTIONS, defaultSettings(), ensureCatalog(), ensureInventory() (+22 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (37): AssembleBranchesOptions, BranchAvailability, BranchAvailabilityOptions, BranchAvailabilityResult, BranchStockAvailability, storeLocations, userAddresses, shippingRoutes (+29 more)

### Community 12 - "Community 12"
Cohesion: 0.12
Nodes (42): backup/pre-secret-clean-main, backup/pre-secret-clean-recovery, main, rescue-recovered-15020f0, restore-recovered-files, sanitized-main, 020d2b2 docs(checklist): audit status Phase 3 Advanced, 4 baris partial jadi [~] dan rekap dihitung ulang, 0bc44bb feat(BR-013): dashboard cabang (+34 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (15): ManualBankProvider, PaymentProvider, ENABLED_PAYMENTS, MidtransOptions, MidtransProvider, PaymentGatewayError, PaymentProvider, allowUnsignedWebhook() (+7 more)

### Community 14 - "Community 14"
Cohesion: 0.10
Nodes (31): AdminPermissionState, getAdminPermissionState(), isPersistedUserId(), loadPermissionOverrides(), ReplaceOverridesInput, replaceUserOverrides(), ADMIN_DEFAULTS, ADMIN_PERMISSIONS (+23 more)

### Community 15 - "Community 15"
Cohesion: 0.10
Nodes (32): assertTimeZone(), ChatHoursError, ChatHoursState, ChatSchedule, cloneSchedule(), DaySchedule, DEFAULT_CHAT_SCHEDULE, describeChatHours() (+24 more)

### Community 16 - "Community 16"
Cohesion: 0.10
Nodes (30): reviewHelpfulVotes, reviewReports, reviews, canWriteReview(), createReview(), hasPurchasedProduct(), helpfulCountsFor(), isPublicReview() (+22 more)

### Community 17 - "Community 17"
Cohesion: 0.10
Nodes (29): applyReceiveStock(), applyShipStock(), assertBranchesExist(), assertDistinctBranches(), assertTransferQuantity(), assertVariantExists(), createStockTransfer(), CreateStockTransferInput (+21 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (30): assertFlashSaleDiscount(), assertFlashSaleItemInput(), assertFlashSalePerUserLimit(), assertFlashSaleStock(), assertFlashSaleTitle(), assertFlashSaleWindow(), evaluateFlashSalePurchase(), FLASH_SALE_DISCOUNT_TYPES (+22 more)

### Community 19 - "Community 19"
Cohesion: 0.11
Nodes (23): ProviderDescriptor, RateComparisonEntry, ShippingService, Address, Dimensions, LogisticGatewayError, LogisticMode, LogisticProvider (+15 more)

### Community 20 - "Community 20"
Cohesion: 0.12
Nodes (24): buildCsv(), buildExport(), escapeCsvValue(), ExportColumn, ExportFormat, ExportResult, ExportType, unsupportedFormatError() (+16 more)

### Community 21 - "Community 21"
Cohesion: 0.12
Nodes (25): assertBranchCanFulfill(), assertFulfillmentMode(), branchSellableStock(), BranchShipmentItem, BranchShipmentPlan, BranchSnapshot, BranchSnapshotInput, BranchTaggedItem (+17 more)

### Community 22 - "Community 22"
Cohesion: 0.13
Nodes (21): exportProducts(), buildPageSeo(), buildProductSeo(), clampText(), DEFAULT_SITE, firstImage(), getPageSeo(), getProductSeo() (+13 more)

### Community 23 - "Community 23"
Cohesion: 0.11
Nodes (26): AppendMessageInput, BranchStockRow, ChatSenderRole, ChatStatus, countOpenConversations(), CreateConversationInput, getChatHours(), getChatScheduleForBranch() (+18 more)

### Community 24 - "Community 24"
Cohesion: 0.12
Nodes (20): closeRedis(), ensureRedisConnected(), getRedisClient(), redisPing(), clientIp(), consumeRateLimit(), correlationIdMiddleware(), RATE_LIMITS (+12 more)

### Community 25 - "Community 25"
Cohesion: 0.14
Nodes (20): notifications, wishlists, wishlistRoutes, addToWishlist(), BackInStockInput, dedupeProductIds(), deliverWishlistAlert(), discountPercent() (+12 more)

### Community 26 - "Community 26"
Cohesion: 0.17
Nodes (25): cart_items, carts, flash_sale_items, flash_sales, order_disputes, order_logs, orders, payment_webhooks (+17 more)

### Community 27 - "Community 27"
Cohesion: 0.14
Nodes (21): adminRoutes, analyticsRoutes, authRoutes, loadAbandonmentPolicy(), loadRecoveryBaseUrl(), notificationAdminRoutes, notificationRoutes, orderRoutes (+13 more)

### Community 28 - "Community 28"
Cohesion: 0.17
Nodes (19): categories, products, OrderItemDraft, base64UrlDecode(), base64UrlEncode(), buildCursorPage(), clampPageSize(), CursorPage (+11 more)

### Community 29 - "Community 29"
Cohesion: 0.16
Nodes (17): isValidPhone(), maskPhone(), normalizePhoneNumber(), phoneSchema, readSmsConfig(), renderOtpMessage(), selectSmsProvider(), sendOtpSms() (+9 more)

### Community 30 - "Community 30"
Cohesion: 0.12
Nodes (16): adjustBranchStock(), AdjustBranchStockInput, BranchInventoryItem, ensureBranchRow(), listBranchInventory(), listBranchInventoryLogs(), syncVariantAggregate(), approveStockTransfer() (+8 more)

### Community 31 - "Community 31"
Cohesion: 0.18
Nodes (18): actorKey(), branchKey(), classifyPresence(), EMPTY_PRESENCE, listPresence(), markOffline(), maskLabel(), normalizeTypingState() (+10 more)

### Community 32 - "Community 32"
Cohesion: 0.25
Nodes (17): applyRelease(), applyReserve(), assertBranchStockRow(), assertQuantity(), BranchStockError, BranchStockErrorCode, BranchStockRow, canFulfill() (+9 more)

### Community 33 - "Community 33"
Cohesion: 0.12
Nodes (18): assertItemNotDuplicated(), checkFlashSaleAvailability(), CreateFlashSaleInput, CreateFlashSaleItemInput, FlashSaleLineView, FlashSalePurchaseInput, FlashSalePurchaseResult, FlashSaleRecord (+10 more)

### Community 34 - "Community 34"
Cohesion: 0.19
Nodes (15): assertReservationInput(), BranchReleaseResult, BranchReservationResult, loadBranchRow(), loadProductId(), loadReferenceLogs(), releaseStockAtBranch(), reserveStockAtBranch() (+7 more)

### Community 35 - "Community 35"
Cohesion: 0.13
Nodes (16): bannerExperiments, customerGroupMembers, customerGroups, flashSaleItems, flashSalePurchases, flashSales, orderDisputes, orderLogs (+8 more)

### Community 36 - "Community 36"
Cohesion: 0.21
Nodes (12): AdminActionInput, isUuid(), listAdminActions(), recordAdminAction(), AdminUserError, countAdmins(), getCustomerDetail(), listCustomers() (+4 more)

### Community 37 - "Community 37"
Cohesion: 0.36
Nodes (18): backup/pre-secret-clean-main, backup/pre-secret-clean-recovery, main, rescue-recovered-15020f0, restore-recovered-files, sanitized-main, 15020f0 chore(sync): sync remote changes and finalize push notification mock, 3364f6a feat(notifications): add mock push notification service and update checklist (+10 more)

### Community 38 - "Community 38"
Cohesion: 0.18
Nodes (14): appendMessage(), ChatError, claimConversation(), closeConversation(), createConversation(), getConversationForStaff(), getConversationForUser(), markConversationRead() (+6 more)

### Community 39 - "Community 39"
Cohesion: 0.22
Nodes (4): LogisticProvider, pickNumber(), pickString(), TembusOnDemandProvider

### Community 40 - "Community 40"
Cohesion: 0.18
Nodes (4): LogisticProvider, pickNumber(), pickString(), TembusAggregatorProvider

### Community 41 - "Community 41"
Cohesion: 0.26
Nodes (15): authMiddleware(), BranchScopeOptions, clearRevocationCache(), isTokenRevoked(), requireRole(), revokeToken(), signAccessToken(), signJwt() (+7 more)

### Community 42 - "Community 42"
Cohesion: 0.19
Nodes (15): addFlashSaleItem(), createFlashSale(), deleteFlashSale(), getFlashSaleRecord(), getFlashSaleView(), removeFlashSaleItem(), updateFlashSale(), updateFlashSaleItem() (+7 more)

### Community 43 - "Community 43"
Cohesion: 0.17
Nodes (10): OrderSourceError, shipments, CreateShipmentParams, TrackingInfo, createShipmentForOrder(), CreateShipmentInput, persistTracking(), syncOrderFromShipment() (+2 more)

### Community 44 - "Community 44"
Cohesion: 0.26
Nodes (13): checkoutRoutes, addCartItem(), calculateShippingRates(), Cart, CartItem, clearCart(), getCart(), memoryCarts (+5 more)

### Community 45 - "Community 45"
Cohesion: 0.21
Nodes (14): categories, order_items, orders, products, promo_usages, promos, public.categories, public.orders (+6 more)

### Community 46 - "Community 46"
Cohesion: 0.19
Nodes (11): maxDays(), RateCalculationParams, FailureResolution, FailureResolutionAction, isTerminalShipmentStatus(), normalizeShipmentStatus(), OrderStatus, RAW_STATUS_MAP (+3 more)

### Community 47 - "Community 47"
Cohesion: 0.37
Nodes (10): clearFailureCache(), clearFailures(), failureKey(), getLockState(), lockKey(), LockState, memoryFailures, memoryKey() (+2 more)

### Community 48 - "Community 48"
Cohesion: 0.27
Nodes (1): LogisticAggregator

### Community 49 - "Community 49"
Cohesion: 0.18
Nodes (5): ChatBroadcast, EventEmitter, PresenceBroadcast, RealtimeHub, TypingBroadcast

### Community 50 - "Community 50"
Cohesion: 0.24
Nodes (9): app, readOrder(), readShipment(), rowsOf(), RUN_ID, seedOrder(), server, stub (+1 more)

### Community 51 - "Community 51"
Cohesion: 0.31
Nodes (9): canTransition(), isOrderStatus(), isTerminal(), nextStatuses(), ORDER_TRANSITIONS, OrderStatus, TERMINAL_STATUSES, TransitionResult (+1 more)

### Community 52 - "Community 52"
Cohesion: 0.20
Nodes (7): assembleBranches(), BranchAvailabilityRow, listProductBranchAvailability(), ProductNotFoundError, BANDUNG, CUSTOMER, SURABAYA

### Community 53 - "Community 53"
Cohesion: 0.31
Nodes (8): findReservedBranch(), getDefaultStoreLocation(), inventoryLogs, adjustStock(), getVariantStock(), releaseReservedStock(), reserveStock(), StockAdjustment

### Community 54 - "Community 54"
Cohesion: 0.32
Nodes (5): app, readOrder(), rowsOf(), seedOrder(), server

### Community 55 - "Community 55"
Cohesion: 0.43
Nodes (5): branchIdOf(), BranchScopeDecision, BranchScopeDenialCode, resolveBranchAccess(), ScopeUser

### Community 56 - "Community 56"
Cohesion: 0.38
Nodes (3): logger, logHttpRequest(), requestLogger()

### Community 57 - "Community 57"
Cohesion: 0.57
Nodes (6): admin_totp, chat_conversations, chat_messages, products, store_locations, users

### Community 58 - "Community 58"
Cohesion: 0.40
Nodes (4): AdminAlert, AlertOptions, buildAdminAlerts(), classifyStock()

### Community 59 - "Community 59"
Cohesion: 0.53
Nodes (5): buildChartSeries(), ChartSeries, DailyPoint, fillDailySeries(), isoDay()

### Community 60 - "Community 60"
Cohesion: 0.33
Nodes (2): ShippingService, ShippingOption

### Community 61 - "Community 61"
Cohesion: 0.33
Nodes (3): results, stamp, today

### Community 62 - "Community 62"
Cohesion: 0.53
Nodes (4): formatOrderNumber(), orderNumberPrefix(), parseOrderNumber(), date

### Community 63 - "Community 63"
Cohesion: 0.50
Nodes (1): TypingThrottle

### Community 64 - "Community 64"
Cohesion: 0.80
Nodes (4): inventory_logs, product_variants, products, users

### Community 65 - "Community 65"
Cohesion: 0.60
Nodes (4): notification_preferences, notification_templates, notifications, users

### Community 66 - "Community 66"
Cohesion: 0.70
Nodes (4): product_variants, stock_transfers, store_locations, users

### Community 67 - "Community 67"
Cohesion: 0.70
Nodes (4): flash_sale_items, flash_sale_purchases, orders, users

### Community 68 - "Community 68"
Cohesion: 0.70
Nodes (4): orders, referral_codes, referrals, users

### Community 69 - "Community 69"
Cohesion: 0.40
Nodes (3): bannerListDuration, failures, productListDuration

### Community 70 - "Community 70"
Cohesion: 0.40
Nodes (2): app, server

### Community 71 - "Community 71"
Cohesion: 0.40
Nodes (2): app, server

### Community 72 - "Community 72"
Cohesion: 0.83
Nodes (3): branch_inventory, product_variants, store_locations

### Community 73 - "Community 73"
Cohesion: 1.00
Nodes (3): loyalty_accounts, loyalty_transactions, users

### Community 74 - "Community 74"
Cohesion: 0.83
Nodes (3): banner_events, banners, users

### Community 75 - "Community 75"
Cohesion: 1.00
Nodes (2): admin_permission_grants, users

## Knowledge Gaps
- **369 isolated node(s):** `categories`, `promos`, `settings`, `store_locations`, `users` (+364 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 48`** (1 nodes): `LogisticAggregator`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (2 nodes): `ShippingService`, `ShippingOption`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `TypingThrottle`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (2 nodes): `app`, `server`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (2 nodes): `app`, `server`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (2 nodes): `admin_permission_grants`, `users`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `db` connect `Community 2` to `Community 58`, `Community 36`, `Community 59`, `Community 14`, `Community 6`, `Community 9`, `Community 11`, `Community 30`, `Community 34`, `Community 21`, `Community 17`, `Community 7`, `Community 20`, `Community 22`, `Community 23`, `Community 1`, `Community 8`, `Community 10`, `Community 43`, `Community 3`, `Community 5`, `Community 33`, `Community 4`, `Community 16`, `Community 44`, `Community 28`, `Community 0`, `Community 53`, `Community 25`, `Community 29`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Why does `TembusOnDemandProvider` connect `Community 39` to `Community 6`, `Community 19`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `TembusAggregatorProvider` connect `Community 40` to `Community 6`, `Community 19`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `categories`, `promos`, `settings` to the rest of the system?**
  _369 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05067920585161965 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05468215994531784 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05030181086519115 - nodes in this community are weakly interconnected._