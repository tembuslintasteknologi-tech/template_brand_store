# Graph Report - .  (2026-11-11)

## Corpus Check
- Corpus is ~5,084 words - fits in a single context window. You may not need a graph.

## Summary
- 85 nodes · 149 edges · 8 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 70 · imports: 39 · imports_from: 27 · calls: 8 · re_exports: 4 · ON_BRANCH: 1


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 13 · Candidates: 15
- Excluded: 206 untracked · 20618 ignored · 0 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `c81d987`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `authMiddleware()` - 7 edges
2. `db` - 6 edges
3. `products` - 5 edges
4. `adminOnlyMiddleware()` - 5 edges
5. `unifiedConfig` - 4 edges
6. `users` - 4 edges
7. `orders` - 4 edges
8. `signJwt()` - 4 edges
9. `verifyJwt()` - 4 edges
10. `orderItems` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 4 - "Community 4"
Cohesion: 0.47
Nodes (3): unifiedConfig, client, pingDatabase()

### Community 1 - "Community 1"
Cohesion: 0.19
Nodes (14): db, users, categories, products, orderItems, app, analyticsRoutes, authRoutes (+6 more)

### Community 3 - "Community 3"
Cohesion: 0.29
Nodes (6): orders, promos, promoUsages, flashSales, flashSaleItems, promoUsages

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (27): productVariants, inventoryLogs, storeLocations, settings, shipments, adminLogs, banners, pages (+19 more)

### Community 2 - "Community 2"
Cohesion: 0.24
Nodes (9): signJwt(), verifyJwt(), signAccessToken(), signRefreshToken(), verifyAccessToken(), verifyRefreshToken(), signToken(), isTokenRevoked() (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.33
Nodes (5): adminOnlyMiddleware(), promoRoutes, promoSchema, validatePromoSchema, promos

### Community 6 - "Community 6"
Cohesion: 0.67
Nodes (2): hono, ContextVariableMap

### Community 7 - "Community 7"
Cohesion: 1.00
Nodes (2): c81d987 feat: complete brand-store template backend with zero trust auth, core commerce, promos, and analytics, main

## Knowledge Gaps
- **33 isolated node(s):** `productVariants`, `inventoryLogs`, `storeLocations`, `settings`, `shipments` (+28 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 6`** (2 nodes): `hono`, `ContextVariableMap`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 7`** (2 nodes): `c81d987 feat: complete brand-store template backend with zero trust auth, core commerce, promos, and analytics`, `main`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `authMiddleware()` connect `Community 2` to `Community 1`, `Community 5`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `unifiedConfig` connect `Community 4` to `Community 1`, `Community 2`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `db` connect `Community 1` to `Community 4`, `Community 5`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **What connects `productVariants`, `inventoryLogs`, `storeLocations` to the rest of the system?**
  _33 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._