# Community Labeling

Engram is running in assistant/skill mode (no API key). You are the host
assistant (Claude Code / Codex / Gemini CLI). Read the community listing below
and write 2-5 word plain-language names for each.

## Language

Write every name in English (en). Do not switch languages.

## Communities

Community 0: authMiddleware(, signJwt(, verifyJwt(, auth.ts, clearRevocationCache(, isTokenRevoked(, requireRole(, revokeToken(, signAccessToken(, signRefreshToken(, signToken(, verifyAccessToken(
Community 1: categories, index.ts, app, analyticsRoutes, auth.ts, authRoutes, products.ts, productRoutes, schemas.ts, loginSchema, productSchema, registerSchema
Community 2: unifiedConfig, unifiedConfig.ts, index.ts, client, closeDatabase(, pingDatabase(
Community 3: db, adminOnlyMiddleware(, promos, promos.ts, promoRoutes, promoSchema
Community 4: schema.ts, inventoryLogs, productVariants, settings, storeLocations
Community 5: orders, orders.ts, orderRoutes, orderSchema
Community 6: products, promosSchema.ts, promoUsages
Community 7: orderItems, users, analytics.ts
Community 8: hono.d.ts, ContextVariableMap, hono
Community 9: main, c81d987 feat: complete brand-store template backend with zer

## Instructions

Write a single JSON object mapping each community id (as a string) to its
2-5 word name to: E:\TEMBUS LINTAS TEKNOLOGI\TEMPLATE WEB MARKETPLACE\brand-store-app\.engram\label-instructions\communities.json

Example:
```json
{
  "0": "Authentication Flow",
  "1": "Authentication Flow",
  "2": "Authentication Flow"
}
```

Then re-run `engram update` (or `engram label`) to ingest the names.
