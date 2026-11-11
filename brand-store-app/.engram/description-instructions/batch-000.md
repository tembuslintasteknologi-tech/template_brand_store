# Node Description Batch 1 of 2

Engram is running in assistant/skill mode (no API key). You are the host
assistant (Claude Code / Codex / Gemini CLI). Read the prompt below and write
your JSON answer to the answer file.

## Prompt

You are documenting nodes in a knowledge graph.
For each entry below, write ONE concise factual plain-language sentence
describing what it is or does. Use only the provided context.
For a code symbol (kind=code-symbol — a function, class, or constant),
describe what the function/symbol does based on its name, source location
and neighbors — e.g. "Resolves the configured ontology profile from graphify.yaml.".
Write every description in English (en). Do not switch languages.
No marketing language.
Respond ONLY with a JSON object mapping each node id (as a string) to its
one-sentence description — no prose, no markdown fences.

- "middleware_auth": "auth.ts" | kind=code-symbol | source=src/middleware/auth.ts:L1 | neighbors=[unifiedConfig.ts, unifiedConfig, adminOnlyMiddleware(), authMiddleware(), clearRevocationCache(), isTokenRevoked()]
- "db_schema": "schema.ts" | kind=code-symbol | source=src/db/schema.ts:L1 | neighbors=[index.ts, promosSchema.ts, categories, inventoryLogs, orderItems, orders]
- "index": "index.ts" | kind=code-symbol | source=src/index.ts:L1 | neighbors=[unifiedConfig.ts, unifiedConfig, app, analytics.ts, analyticsRoutes, auth.ts]
- "routes_orders": "orders.ts" | kind=code-symbol | source=src/routes/orders.ts:L1 | neighbors=[index.ts, index.ts, db, schema.ts, orderItems, orders]
- "db_index": "index.ts" | kind=code-symbol | source=src/db/index.ts:L1 | neighbors=[unifiedConfig.ts, unifiedConfig, client, closeDatabase(), db, pingDatabase()]
- "routes_analytics": "analytics.ts" | kind=code-symbol | source=src/routes/analytics.ts:L1 | neighbors=[index.ts, index.ts, db, schema.ts, orderItems, orders]
- "routes_products": "products.ts" | kind=code-symbol | source=src/routes/products.ts:L1 | neighbors=[index.ts, index.ts, db, schema.ts, categories, products]
- "routes_promos": "promos.ts" | kind=code-symbol | source=src/routes/promos.ts:L1 | neighbors=[index.ts, index.ts, db, promosSchema.ts, promos, auth.ts]
- "routes_auth": "auth.ts" | kind=code-symbol | source=src/routes/auth.ts:L1 | neighbors=[index.ts, index.ts, db, schema.ts, users, authRoutes]
- "db_promosschema": "promosSchema.ts" | kind=code-symbol | source=src/db/promosSchema.ts:L1 | neighbors=[promos, promoUsages, schema.ts, orders, products, users]
- "validators_schemas": "schemas.ts" | kind=code-symbol | source=src/validators/schemas.ts:L1 | neighbors=[auth.ts, orders.ts, products.ts, loginSchema, orderSchema, productSchema]
- "db_index_db": "db" | kind=code-symbol | source=src/db/index.ts:L7 | neighbors=[index.ts, analytics.ts, auth.ts, orders.ts, products.ts, promos.ts]
- "middleware_auth_authmiddleware": "authMiddleware()" | kind=code-symbol | source=src/middleware/auth.ts:L52 | neighbors=[auth.ts, verifyJwt(), analytics.ts, orders.ts, products.ts, promos.ts]
- "db_schema_products": "products" | kind=code-symbol | source=src/db/schema.ts:L29 | neighbors=[promosSchema.ts, schema.ts, analytics.ts, orders.ts, products.ts]
- "middleware_auth_adminonlymiddleware": "adminOnlyMiddleware()" | kind=code-symbol | source=src/middleware/auth.ts:L74 | neighbors=[auth.ts, analytics.ts, orders.ts, products.ts, promos.ts]
- "config_unifiedconfig": "unifiedConfig.ts" | kind=code-symbol | source=src/config/unifiedConfig.ts:L1 | neighbors=[unifiedConfig, index.ts, index.ts, auth.ts]
- "config_unifiedconfig_unifiedconfig": "unifiedConfig" | kind=code-symbol | source=src/config/unifiedConfig.ts:L4 | neighbors=[unifiedConfig.ts, index.ts, index.ts, auth.ts]
- "db_schema_orders": "orders" | kind=code-symbol | source=src/db/schema.ts:L102 | neighbors=[promosSchema.ts, schema.ts, analytics.ts, orders.ts]
- "db_schema_users": "users" | kind=code-symbol | source=src/db/schema.ts:L3 | neighbors=[promosSchema.ts, schema.ts, analytics.ts, auth.ts]
- "middleware_auth_signjwt": "signJwt()" | kind=code-symbol | source=src/middleware/auth.ts:L5 | neighbors=[auth.ts, signAccessToken(), signRefreshToken(), signToken()]
- "middleware_auth_verifyjwt": "verifyJwt()" | kind=code-symbol | source=src/middleware/auth.ts:L9 | neighbors=[auth.ts, authMiddleware(), verifyAccessToken(), verifyRefreshToken()]
- "db_schema_orderitems": "orderItems" | kind=code-symbol | source=src/db/schema.ts:L121 | neighbors=[schema.ts, analytics.ts, orders.ts]
- "db_index_client": "client" | kind=code-symbol | source=src/db/index.ts:L6 | neighbors=[index.ts, pingDatabase()]
- "db_index_pingdatabase": "pingDatabase()" | kind=code-symbol | source=src/db/index.ts:L9 | neighbors=[index.ts, client]
- "db_promosschema_promos": "promos" | kind=code-symbol | source=src/db/promosSchema.ts:L4 | neighbors=[promosSchema.ts, promos.ts]
- "db_schema_categories": "categories" | kind=code-symbol | source=src/db/schema.ts:L18 | neighbors=[schema.ts, products.ts]
- "middleware_auth_signaccesstoken": "signAccessToken()" | kind=code-symbol | source=src/middleware/auth.ts:L13 | neighbors=[auth.ts, signJwt()]
- "middleware_auth_signrefreshtoken": "signRefreshToken()" | kind=code-symbol | source=src/middleware/auth.ts:L17 | neighbors=[auth.ts, signJwt()]
- "middleware_auth_signtoken": "signToken()" | kind=code-symbol | source=src/middleware/auth.ts:L29 | neighbors=[auth.ts, signJwt()]
- "middleware_auth_verifyaccesstoken": "verifyAccessToken()" | kind=code-symbol | source=src/middleware/auth.ts:L21 | neighbors=[auth.ts, verifyJwt()]
- "middleware_auth_verifyrefreshtoken": "verifyRefreshToken()" | kind=code-symbol | source=src/middleware/auth.ts:L25 | neighbors=[auth.ts, verifyJwt()]
- "routes_analytics_analyticsroutes": "analyticsRoutes" | kind=code-symbol | source=src/routes/analytics.ts:L7 | neighbors=[index.ts, analytics.ts]
- "routes_auth_authroutes": "authRoutes" | kind=code-symbol | source=src/routes/auth.ts:L8 | neighbors=[index.ts, auth.ts]
- "routes_orders_orderroutes": "orderRoutes" | kind=code-symbol | source=src/routes/orders.ts:L8 | neighbors=[index.ts, orders.ts]
- "routes_products_productroutes": "productRoutes" | kind=code-symbol | source=src/routes/products.ts:L8 | neighbors=[index.ts, products.ts]
- "routes_promos_promoroutes": "promoRoutes" | kind=code-symbol | source=src/routes/promos.ts:L8 | neighbors=[index.ts, promos.ts]
- "types_hono_d": "hono.d.ts" | kind=code-symbol | source=src/types/hono.d.ts:L1 | neighbors=[ContextVariableMap, hono]
- "validators_schemas_loginschema": "loginSchema" | kind=code-symbol | source=src/validators/schemas.ts:L10 | neighbors=[auth.ts, schemas.ts]
- "validators_schemas_orderschema": "orderSchema" | kind=code-symbol | source=src/validators/schemas.ts:L28 | neighbors=[orders.ts, schemas.ts]
- "validators_schemas_productschema": "productSchema" | kind=code-symbol | source=src/validators/schemas.ts:L15 | neighbors=[products.ts, schemas.ts]

## Instructions

Write a single JSON object mapping each node id to a one-sentence description
to: E:\TEMBUS LINTAS TEKNOLOGI\TEMPLATE WEB MARKETPLACE\brand-store-app\.engram\description-instructions\batch-000.json

Keep each description factual and concise (one sentence). No markdown, no prose
outside the JSON object. It is acceptable to omit a node if context is
insufficient — but include every node you can ground confidently.

Example answer format:
```json
{
  "node_id_1": "Resolves the configured ontology profile from graphify.yaml.",
  "node_id_2": "Colonel James Barclay, an antagonist in The Crooked Man."
}
```
