# API Documentation - Brand Store App (Phase 1)

Base URL: \/api/v1\

## Authentication Endpoints
- \POST /api/v1/auth/register\: Register a new customer or admin account.
- \POST /api/v1/auth/login\: Authenticate and receive access & refresh tokens.
- \POST /api/v1/auth/refresh\: Rotate refresh token and get new access token.

## Inventory Endpoints
- \GET /api/v1/inventory/{variantId}\: Get current stock and reserved status for a product variant.

## Checkout & Cart Endpoints
- \POST /api/v1/cart/items\: Add item to user or guest cart.
- \POST /api/v1/checkout/process\: Process cart checkout, reserve stock, and generate order.

## Logistics Endpoints
- \POST /api/v1/logistics/calculate-rates\: Calculate shipping rates based on destination and weight.
- \POST /api/v1/logistics/shipments\: Create a shipment for an order.
