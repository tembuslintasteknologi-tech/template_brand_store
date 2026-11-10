# API Documentation
## Brand Store Template Backend

---

**Base URL:** `https://api.{domain}.com/v1`  
**Version:** 1.0.0  
**Last Updated:** 2026-11-09

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Users](#2-users)
3. [Catalog](#3-catalog)
4. [Cart](#4-cart)
5. [Checkout](#5-checkout)
6. [Orders](#6-orders)
7. [Payments](#7-payments)
8. [Logistics](#8-logistics)
9. [Reviews](#9-reviews)
10. [Promotions](#10-promotions)
11. [Notifications](#11-notifications)
12. [Admin](#12-admin)
13. [WebSocket](#13-websocket)
14. [Webhooks](#14-webhooks)

---

## 1. AUTHENTICATION

### 1.1 Register

```http
POST /api/v1/auth/register
Content-Type: application/json
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe",
  "phone": "+6281234567890"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_abc123",
      "email": "user@example.com",
      "name": "John Doe",
      "phone": "+6281234567890",
      "role": "customer",
      "isVerified": false,
      "createdAt": "2026-11-09T21:00:00Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJSUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJSUzI1NiIs...",
      "expiresIn": 900
    }
  }
}
```

### 1.2 Login

```http
POST /api/v1/auth/login
Content-Type: application/json
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": { ... },
    "tokens": {
      "accessToken": "eyJhbGciOiJSUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJSUzI1NiIs...",
      "expiresIn": 900
    }
  }
}
```

### 1.3 Social Login

```http
POST /api/v1/auth/social
Content-Type: application/json
```

**Request:**
```json
{
  "provider": "google",
  "token": "google_id_token_here"
}
```

**Providers:** `google`, `apple`, `facebook`

### 1.4 Refresh Token

```http
POST /api/v1/auth/refresh
Content-Type: application/json
```

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJSUzI1NiIs..."
}
```

### 1.5 Logout

```http
POST /api/v1/auth/logout
Authorization: Bearer <access_token>
```

### 1.6 Request OTP

```http
POST /api/v1/auth/otp/request
Content-Type: application/json
```

**Request:**
```json
{
  "phone": "+6281234567890",
  "purpose": "login"
}
```

**Purposes:** `login`, `register`, `verify`, `reset_password`

### 1.7 Verify OTP

```http
POST /api/v1/auth/otp/verify
Content-Type: application/json
```

**Request:**
```json
{
  "phone": "+6281234567890",
  "otp": "123456",
  "purpose": "login"
}
```

### 1.8 Forgot Password

```http
POST /api/v1/auth/forgot-password
Content-Type: application/json
```

**Request:**
```json
{
  "email": "user@example.com"
}
```

### 1.9 Reset Password

```http
POST /api/v1/auth/reset-password
Content-Type: application/json
```

**Request:**
```json
{
  "token": "reset_token_from_email",
  "newPassword": "NewSecurePass123!"
}
```

---

## 2. USERS

### 2.1 Get Profile

```http
GET /api/v1/users/me
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "usr_abc123",
    "email": "user@example.com",
    "name": "John Doe",
    "phone": "+6281234567890",
    "avatar": "https://cdn.example.com/avatars/usr_abc123.jpg",
    "role": "customer",
    "loyaltyPoints": 150,
    "loyaltyTier": "silver",
    "walletBalance": 50000,
    "isVerified": true,
    "createdAt": "2026-11-09T21:00:00Z"
  }
}
```

### 2.2 Update Profile

```http
PUT /api/v1/users/me
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request:**
```json
{
  "name": "John Updated",
  "avatar": "https://cdn.example.com/avatars/new.jpg",
  "bio": "Software developer"
}
```

### 2.3 Change Password

```http
PUT /api/v1/users/me/password
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request:**
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass123!"
}
```

### 2.4 Delete Account

```http
DELETE /api/v1/users/me
Authorization: Bearer <access_token>
```

---

## 3. ADDRESSES

### 3.1 List Addresses

```http
GET /api/v1/users/me/addresses
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "addr_abc123",
      "label": "Rumah",
      "recipientName": "John Doe",
      "phone": "+6281234567890",
      "address": "Jl. Merdeka No. 123",
      "city": "Jakarta",
      "province": "DKI Jakarta",
      "postalCode": "12345",
      "isDefault": true,
      "coordinates": {
        "lat": -6.2088,
        "lng": 106.8456
      }
    }
  ]
}
```

### 3.2 Add Address

```http
POST /api/v1/users/me/addresses
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request:**
```json
{
  "label": "Kantor",
  "recipientName": "John Doe",
  "phone": "+6281234567890",
  "address": "Jl. Sudirman No. 456",
  "city": "Jakarta",
  "province": "DKI Jakarta",
  "postalCode": "12346",
  "isDefault": false
}
```

### 3.3 Update Address

```http
PUT /api/v1/users/me/addresses/:id
Authorization: Bearer <access_token>
```

### 3.4 Delete Address

```http
DELETE /api/v1/users/me/addresses/:id
Authorization: Bearer <access_token>
```

### 3.5 Set Default Address

```http
PUT /api/v1/users/me/addresses/:id/default
Authorization: Bearer <access_token>
```

---

## 4. CATALOG

### 4.1 List Products

```http
GET /api/v1/products?page=1&limit=20&category=electronics&sort=price:asc&minPrice=100000&maxPrice=5000000
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20, max: 100) |
| category | string | Category ID or slug |
| search | string | Search keyword |
| minPrice | number | Minimum price |
| maxPrice | number | Maximum price |
| sort | string | Sort field and order (e.g., `price:asc`, `created_at:desc`) |
| isFeatured | boolean | Featured products only |
| rating | number | Minimum rating (1-5) |
| attributes | object | Dynamic attributes filter |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "prd_abc123",
      "name": "Wireless Headphones",
      "slug": "wireless-headphones",
      "description": "High-quality wireless headphones...",
      "basePrice": 499000,
      "compareAtPrice": 599000,
      "currency": "IDR",
      "rating": 4.5,
      "reviewCount": 128,
      "category": {
        "id": "cat_electronics",
        "name": "Electronics"
      },
      "primaryImage": {
        "url": "https://cdn.example.com/products/headphones-1.jpg",
        "alt": "Wireless Headphones"
      },
      "variants": [
        {
          "id": "var_black",
          "sku": "WH-BLK-001",
          "attributes": { "color": "Black" },
          "price": 499000,
          "stock": 50
        },
        {
          "id": "var_white",
          "sku": "WH-WHT-001",
          "attributes": { "color": "White" },
          "price": 499000,
          "stock": 30
        }
      ],
      "isFeatured": true,
      "createdAt": "2026-11-01T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 4.2 Get Product Detail

```http
GET /api/v1/products/:id
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "prd_abc123",
    "name": "Wireless Headphones",
    "slug": "wireless-headphones",
    "description": "High-quality wireless headphones with noise cancellation...",
    "basePrice": 499000,
    "compareAtPrice": 599000,
    "currency": "IDR",
    "rating": 4.5,
    "reviewCount": 128,
    "category": {
      "id": "cat_electronics",
      "name": "Electronics",
      "parent": { "id": "cat_tech", "name": "Technology" }
    },
    "images": [
      { "url": "https://cdn.example.com/products/headphones-1.jpg", "alt": "Front view", "isPrimary": true },
      { "url": "https://cdn.example.com/products/headphones-2.jpg", "alt": "Side view", "isPrimary": false }
    ],
    "variants": [
      {
        "id": "var_black",
        "sku": "WH-BLK-001",
        "barcode": "1234567890123",
        "attributes": { "color": "Black" },
        "price": 499000,
        "stock": 50,
        "imageUrl": "https://cdn.example.com/products/headphones-black.jpg"
      }
    ],
    "attributes": {
      "brand": "Sony",
      "model": "WH-1000XM4",
      "warranty": "1 year",
      "connectivity": ["Bluetooth", "3.5mm"]
    },
    "reviews": {
      "average": 4.5,
      "count": 128,
      "distribution": { "5": 80, "4": 30, "3": 10, "2": 5, "1": 3 }
    },
    "relatedProducts": [...],
    "seo": {
      "title": "Wireless Headphones - Audio Store",
      "description": "Buy high-quality wireless headphones..."
    }
  }
}
```

### 4.3 Search Products

```http
GET /api/v1/search?q=headphones&category=electronics&minPrice=100000&maxPrice=1000000&sort=relevance
```

**Search Features:**
- Full-text search on name, description, tags
- Fuzzy matching for typos
- Auto-suggestions: `GET /api/v1/search/suggest?q=head`

### 4.4 Get Categories

```http
GET /api/v1/categories
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "cat_tech",
      "name": "Technology",
      "slug": "technology",
      "image": "https://cdn.example.com/categories/tech.jpg",
      "children": [
        {
          "id": "cat_electronics",
          "name": "Electronics",
          "slug": "electronics",
          "children": [...]
        }
      ]
    }
  ]
}
```

---

## 5. CART

### 5.1 Get Cart

```http
GET /api/v1/cart
Authorization: Bearer <access_token> (optional for guest)
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "cart_abc123",
    "items": [
      {
        "id": "item_xyz789",
        "product": {
          "id": "prd_abc123",
          "name": "Wireless Headphones",
          "image": "https://cdn.example.com/products/headphones-1.jpg"
        },
        "variant": {
          "id": "var_black",
          "sku": "WH-BLK-001",
          "attributes": { "color": "Black" }
        },
        "quantity": 2,
        "unitPrice": 499000,
        "subtotal": 998000
      }
    ],
    "summary": {
      "subtotal": 998000,
      "totalItems": 2,
      "estimatedShipping": 0,
      "estimatedTax": 99800,
      "estimatedTotal": 1097800
    }
  }
}
```

### 5.2 Add to Cart

```http
POST /api/v1/cart/items
Content-Type: application/json
```

**Request:**
```json
{
  "productId": "prd_abc123",
  "variantId": "var_black",
  "quantity": 2
}
```

### 5.3 Update Cart Item

```http
PUT /api/v1/cart/items/:id
Content-Type: application/json
```

**Request:**
```json
{
  "quantity": 3
}
```

### 5.4 Remove Cart Item

```http
DELETE /api/v1/cart/items/:id
```

### 5.5 Clear Cart

```http
DELETE /api/v1/cart
```

---

## 6. CHECKOUT

### 6.1 Get Quote

```http
POST /api/v1/checkout/quote
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request:**
```json
{
  "addressId": "addr_abc123",
  "items": [
    { "variantId": "var_black", "quantity": 2 }
  ],
  "promoCode": "SAVE10"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "items": [...],
    "subtotal": 998000,
    "discount": 99800,
    "shippingOptions": [
      {
        "provider": "tembus",
        "service": "REG",
        "name": "Tembus Regular",
        "estimatedDays": "3-5",
        "cost": 15000
      },
      {
        "provider": "tembus",
        "service": "EXP",
        "name": "Tembus Express",
        "estimatedDays": "1-2",
        "cost": 35000
      }
    ],
    "tax": 89820,
    "total": 983020,
    "currency": "IDR"
  }
}
```

### 6.2 Process Checkout

```http
POST /api/v1/checkout/process
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request:**
```json
{
  "addressId": "addr_abc123",
  "shippingMethod": {
    "provider": "tembus",
    "service": "REG"
  },
  "paymentMethod": {
    "type": "qris",
    "provider": "midtrans"
  },
  "promoCode": "SAVE10",
  "notes": "Please handle with care"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "orderId": "ord_abc123",
    "orderNumber": "INV/2026/11/000001",
    "payment": {
      "id": "pay_xyz789",
      "type": "qris",
      "provider": "midtrans",
      "qrCodeUrl": "https://api.midtrans.com/qris/...",
      "expiryTime": "2026-11-09T21:15:00Z"
    },
    "total": 983020,
    "currency": "IDR"
  }
}
```

---

## 7. ORDERS

### 7.1 List Orders

```http
GET /api/v1/orders?status=paid&page=1&limit=20
Authorization: Bearer <access_token>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| status | string | Filter by status |
| page | number | Page number |
| limit | number | Items per page |
| dateFrom | string | Filter from date |
| dateTo | string | Filter to date |

### 7.2 Get Order Detail

```http
GET /api/v1/orders/:id
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "ord_abc123",
    "orderNumber": "INV/2026/11/000001",
    "status": "shipped",
    "items": [
      {
        "id": "item_xyz789",
        "product": {
          "id": "prd_abc123",
          "name": "Wireless Headphones",
          "image": "https://cdn.example.com/products/headphones-1.jpg"
        },
        "variant": {
          "id": "var_black",
          "sku": "WH-BLK-001",
          "attributes": { "color": "Black" }
        },
        "quantity": 2,
        "unitPrice": 499000,
        "subtotal": 998000
      }
    ],
    "pricing": {
      "subtotal": 998000,
      "discount": 99800,
      "shipping": 15000,
      "tax": 89820,
      "total": 983020
    },
    "shipping": {
      "address": { ... },
      "method": {
        "provider": "tembus",
        "service": "REG",
        "name": "Tembus Regular"
      },
      "tracking": {
        "awb": "TMB123456789",
        "status": "in_transit",
        "estimatedDelivery": "2026-11-12",
        "history": [
          {
            "status": "picked_up",
            "timestamp": "2026-11-09T14:00:00Z",
            "location": "Jakarta Hub"
          }
        ]
      }
    },
    "payment": {
      "id": "pay_xyz789",
      "type": "qris",
      "provider": "midtrans",
      "status": "paid",
      "paidAt": "2026-11-09T21:05:00Z"
    },
    "timeline": [
      { "status": "created", "timestamp": "2026-11-09T21:00:00Z" },
      { "status": "paid", "timestamp": "2026-11-09T21:05:00Z" },
      { "status": "processing", "timestamp": "2026-11-10T09:00:00Z" },
      { "status": "shipped", "timestamp": "2026-11-10T14:00:00Z" }
    ],
    "createdAt": "2026-11-09T21:00:00Z"
  }
}
```

### 7.3 Cancel Order

```http
POST /api/v1/orders/:id/cancel
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request:**
```json
{
  "reason": "Changed my mind"
}
```

### 7.4 Get Invoice

```http
GET /api/v1/orders/:id/invoice
Authorization: Bearer <access_token>
```

**Response:** PDF file download

---

## 8. PAYMENTS

### 8.1 Get Payment Methods

```http
GET /api/v1/payments/methods?amount=983020
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "type": "qris",
      "name": "QRIS",
      "provider": "midtrans",
      "icon": "https://cdn.example.com/payment/qris.png",
      "fee": 0.007,
      "isAvailable": true
    },
    {
      "type": "virtual_account",
      "name": "Virtual Account",
      "provider": "midtrans",
      "banks": [
        { "code": "bca", "name": "BCA" },
        { "code": "bni", "name": "BNI" },
        { "code": "bri", "name": "BRI" }
      ],
      "fee": 4000,
      "isAvailable": true
    },
    {
      "type": "e_wallet",
      "name": "E-Wallet",
      "provider": "midtrans",
      "wallets": [
        { "code": "gopay", "name": "GoPay" },
        { "code": "ovo", "name": "OVO" },
        { "code": "dana", "name": "DANA" }
      ],
      "fee": 0.02,
      "isAvailable": true
    }
  ]
}
```

### 8.2 Get Payment Status

```http
GET /api/v1/payments/:id/status
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "pay_xyz789",
    "status": "paid",
    "method": "qris",
    "provider": "midtrans",
    "amount": 983020,
    "paidAt": "2026-11-09T21:05:00Z"
  }
}
```

---

## 9. LOGISTICS

### 9.1 Calculate Shipping Rates

```http
POST /api/v1/logistics/rates
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request:**
```json
{
  "originAddressId": "addr_warehouse1",
  "destinationAddressId": "addr_customer456",
  "items": [
    { "variantId": "var_black", "quantity": 2 }
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "provider": "tembus",
      "service": "REG",
      "name": "Tembus Regular",
      "estimatedDays": "3-5",
      "cost": 15000,
      "isAvailable": true
    },
    {
      "provider": "tembus",
      "service": "EXP",
      "name": "Tembus Express",
      "estimatedDays": "1-2",
      "cost": 35000,
      "isAvailable": true
    },
    {
      "provider": "tembus",
      "service": "SAME_DAY",
      "name": "Tembus Same Day",
      "estimatedDays": "0-1",
      "cost": 55000,
      "isAvailable": true
    }
  ]
}
```

### 9.2 Track Shipment

```http
GET /api/v1/logistics/track/:awb
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "awb": "TMB123456789",
    "provider": "tembus",
    "service": "REG",
    "status": "in_transit",
    "origin": "Jakarta",
    "destination": "Bandung",
    "estimatedDelivery": "2026-11-12",
    "history": [
      {
        "status": "created",
        "timestamp": "2026-11-10T09:00:00Z",
        "location": "Jakarta Warehouse"
      },
      {
        "status": "picked_up",
        "timestamp": "2026-11-10T14:00:00Z",
        "location": "Jakarta Hub"
      },
      {
        "status": "in_transit",
        "timestamp": "2026-11-11T08:00:00Z",
        "location": "Bandung Hub"
      }
    ]
  }
}
```

---

## 10. REVIEWS

### 10.1 Add Review

```http
POST /api/v1/products/:id/reviews
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request:**
```json
{
  "orderItemId": "item_xyz789",
  "rating": 5,
  "title": "Great product!",
  "comment": "Sound quality is amazing...",
  "images": ["https://cdn.example.com/reviews/img1.jpg"]
}
```

### 10.2 Get Product Reviews

```http
GET /api/v1/products/:id/reviews?page=1&limit=10&sort=helpful
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "rev_abc123",
      "user": {
        "id": "usr_xyz789",
        "name": "Jane Doe",
        "avatar": "https://cdn.example.com/avatars/jane.jpg"
      },
      "rating": 5,
      "title": "Great product!",
      "comment": "Sound quality is amazing...",
      "images": [...],
      "helpful": 12,
      "isVerifiedPurchase": true,
      "createdAt": "2026-11-05T10:00:00Z",
      "reply": {
        "comment": "Thank you for your review!",
        "createdAt": "2026-11-06T09:00:00Z"
      }
    }
  ]
}
```

### 10.3 Mark Review Helpful

```http
POST /api/v1/reviews/:id/helpful
Authorization: Bearer <access_token>
```

---

## 11. PROMOTIONS

### 11.1 Validate Promo Code

```http
POST /api/v1/promos/validate
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request:**
```json
{
  "code": "SAVE10",
  "cartTotal": 998000,
  "items": [...]
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "code": "SAVE10",
    "type": "percentage",
    "value": 10,
    "discount": 99800,
    "isValid": true,
    "message": "Promo applied successfully"
  }
}
```

### 11.2 List Active Promos

```http
GET /api/v1/promos/active
```

### 11.3 Get Flash Sales

```http
GET /api/v1/flash-sales?status=active
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "flash_abc123",
      "title": "Flash Sale: Electronics",
      "startTime": "2026-11-09T20:00:00Z",
      "endTime": "2026-11-09T23:59:59Z",
      "products": [
        {
          "id": "prd_abc123",
          "name": "Wireless Headphones",
          "originalPrice": 499000,
          "flashPrice": 299000,
          "stock": 50,
          "sold": 23
        }
      ]
    }
  ]
}
```

---

## 12. NOTIFICATIONS

### 12.1 List Notifications

```http
GET /api/v1/notifications?page=1&limit=20&unread=true
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "ntf_abc123",
      "type": "order_shipped",
      "title": "Pesanan Dikirim",
      "body": "Pesanan INV/2026/11/000001 telah dikirim",
      "data": {
        "orderId": "ord_abc123",
        "deepLink": "/orders/ord_abc123"
      },
      "isRead": false,
      "createdAt": "2026-11-10T14:00:00Z"
    }
  ],
  "unreadCount": 5
}
```

### 12.2 Mark as Read

```http
PUT /api/v1/notifications/:id/read
Authorization: Bearer <access_token>
```

### 12.3 Mark All as Read

```http
PUT /api/v1/notifications/read-all
Authorization: Bearer <access_token>
```

### 12.4 Update Preferences

```http
PUT /api/v1/notifications/preferences
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request:**
```json
{
  "push": {
    "orderUpdates": true,
    "promotions": false,
    "chat": true
  },
  "email": {
    "orderUpdates": true,
    "promotions": false,
    "newsletter": true
  },
  "sms": {
    "orderUpdates": true,
    "promotions": false
  }
}
```

---

## 13. WISHLIST

### 13.1 Get Wishlist

```http
GET /api/v1/wishlist
Authorization: Bearer <access_token>
```

### 13.2 Add to Wishlist

```http
POST /api/v1/wishlist
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request:**
```json
{
  "productId": "prd_abc123"
}
```

### 13.3 Remove from Wishlist

```http
DELETE /api/v1/wishlist/:productId
Authorization: Bearer <access_token>
```

---

## 14. ADMIN API

### 14.1 Dashboard

```http
GET /api/v1/admin/dashboard
Authorization: Bearer <access_token> (admin only)
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "kpi": {
      "todayRevenue": 15000000,
      "todayOrders": 45,
      "todayUsers": 12,
      "pendingOrders": 8,
      "lowStockAlerts": 5
    },
    "charts": {
      "revenueTrend": [...],
      "orderVolume": [...],
      "topProducts": [...]
    },
    "recentActivity": [...]
  }
}
```

### 14.2 User Management

```http
GET /api/v1/admin/users?role=customer&status=active&page=1
PUT /api/v1/admin/users/:id/status
PUT /api/v1/admin/users/:id/role
```

### 14.3 Banner Management

```http
GET /api/v1/admin/banners
POST /api/v1/admin/banners
PUT /api/v1/admin/banners/:id
DELETE /api/v1/admin/banners/:id
```

**Request:**
```json
{
  "title": "Flash Sale November",
  "image": "https://cdn.example.com/banners/flash-sale.jpg",
  "link": "/flash-sale",
  "position": "hero",
  "startDate": "2026-11-09T00:00:00Z",
  "endDate": "2026-11-30T23:59:59Z",
  "isActive": true,
  "sortOrder": 1
}
```

### 14.4 Promo Management

```http
GET /api/v1/admin/promos
POST /api/v1/admin/promos
PUT /api/v1/admin/promos/:id
DELETE /api/v1/admin/promos/:id
```

**Request:**
```json
{
  "code": "SAVE10",
  "type": "percentage",
  "value": 10,
  "minPurchase": 100000,
  "maxDiscount": 50000,
  "usageLimit": 1000,
  "perUserLimit": 1,
  "startDate": "2026-11-09T00:00:00Z",
  "endDate": "2026-11-30T23:59:59Z",
  "applicableTo": {
    "type": "all"
  }
}
```

### 14.5 Order Management

```http
GET /api/v1/admin/orders?status=paid&page=1
PUT /api/v1/admin/orders/:id/status
POST /api/v1/admin/orders/:id/notes
```

### 14.6 Reports

```http
GET /api/v1/admin/reports/sales?dateFrom=2026-11-01&dateTo=2026-11-30
GET /api/v1/admin/reports/users
GET /api/v1/admin/reports/products
GET /api/v1/admin/reports/finance
```

---

## 15. WEBSOCKET

### 15.1 Connection

```javascript
const ws = new WebSocket('wss://api.example.com/v1/ws?token=<access_token>');
```

### 15.2 Events

**Client → Server:**
```json
{ "type": "subscribe", "channel": "order:ord_abc123" }
{ "type": "unsubscribe", "channel": "order:ord_abc123" }
{ "type": "ping" }
```

**Server → Client:**
```json
{ "type": "pong" }
{ "type": "notification", "data": { ... } }
{ "type": "order_update", "data": { "orderId": "ord_abc123", "status": "shipped" } }
{ "type": "chat_message", "data": { ... } }
```

---

## 16. WEBHOOKS

### 16.1 Payment Webhook

```http
POST /webhooks/payment/:provider
```

**Providers:** `midtrans`, `xendit`, `stripe`

**Payload (Midtrans example):**
```json
{
  "transaction_time": "2026-11-09 21:05:00",
  "transaction_status": "settlement",
  "transaction_id": "pay_xyz789",
  "order_id": "ord_abc123",
  "payment_type": "qris",
  "gross_amount": "983020"
}
```

### 16.2 Logistics Webhook

```http
POST /webhooks/logistics/:provider
```

**Providers:** `tembus`

**Payload (Tembus example):**
```json
{
  "awb": "TMB123456789",
  "order_id": "ord_abc123",
  "status": "delivered",
  "timestamp": "2026-11-12T14:00:00Z",
  "location": "Bandung",
  "notes": "Package delivered to recipient"
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| VALIDATION_ERROR | 400 | Invalid input data |
| UNAUTHORIZED | 401 | Missing or invalid token |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Resource conflict (e.g., duplicate email) |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |
| SERVICE_UNAVAILABLE | 503 | External service down |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `/auth/*` | 5 req/min per IP |
| `/api/*` | 100 req/min per user |
| `/search` | 30 req/min per user |
| `/webhooks/*` | 1000 req/min per provider |

---

*End of API Documentation*
