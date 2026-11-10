# Integration Guide
## Brand Store Template Backend

---

**Version:** 1.0.0  
**Last Updated:** 2026-11-09

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Payment Gateway Setup](#2-payment-gateway-setup)
3. [Tembus Logistics Setup](#3-tembus-logistics-setup)
4. [Frontend Integration](#4-frontend-integration)
5. [Webhook Configuration](#5-webhook-configuration)
6. [Environment Setup](#6-environment-setup)
7. [Deployment](#7-deployment)

---

## 1. GETTING STARTED

### 1.1 Prerequisites

- Bun 1.1.x or Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Docker (optional, for containerized deployment)

### 1.2 Installation

```bash
# Clone repository
git clone https://github.com/your-org/brand-store-template.git
cd brand-store-template

# Install dependencies
bun install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
bun run db:migrate

# Seed initial data (optional)
bun run db:seed

# Start development server
bun run dev
```

### 1.3 Project Structure

```
brand-store-template/
├── src/
│   ├── index.ts              # Entry point
│   ├── app.ts                # Hono app setup
│   ├── config/               # Configuration
│   ├── db/                   # Database
│   │   ├── schema/           # Drizzle schemas
│   │   └── migrations/       # SQL migrations
│   ├── modules/              # Feature modules
│   │   ├── auth/
│   │   ├── users/
│   │   ├── products/
│   │   ├── orders/
│   │   ├── payments/
│   │   ├── logistics/
│   │   ├── notifications/
│   │   └── admin/
│   ├── lib/                  # Utilities
│   ├── middleware/           # Hono middleware
│   └── types/                # TypeScript types
├── packages/
│   ├── payment-adapter/      # Payment provider interface
│   └── logistic-adapter/     # Logistics provider interface
├── docs/                     # Documentation
├── tests/                    # Test files
├── docker-compose.yml
├── Dockerfile
└── package.json
```

---

## 2. PAYMENT GATEWAY SETUP

### 2.1 Midtrans Integration

**Step 1: Get API Keys**
1. Register at https://dashboard.midtrans.com
2. Go to Settings → Access Keys
3. Copy Server Key and Client Key

**Step 2: Configure Environment**

```env
# .env
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxx  # Sandbox
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxx  # Sandbox
MIDTRANS_IS_PRODUCTION=false
```

**Step 3: Setup Webhook**

In Midtrans Dashboard → Settings → Configuration:
- Payment Notification URL: `https://your-api.com/webhooks/payment/midtrans`

**Supported Payment Methods:**

| Method | Type | Notes |
|--------|------|-------|
| QRIS | `qris` | All e-wallets and banking apps |
| Virtual Account | `bank_transfer` | BCA, BNI, BRI, Mandiri, Permata |
| E-Wallet | `e_wallet` | GoPay, OVO, DANA, ShopeePay |
| Credit Card | `credit_card` | Visa, Mastercard, JCB |
| Retail | `retail` | Indomaret, Alfamart |

### 2.2 Xendit Integration

**Step 1: Get API Keys**
1. Register at https://dashboard.xendit.co
2. Go to Settings → API Keys

**Step 2: Configure Environment**

```env
XENDIT_SECRET_KEY=xnd_development_xxxxx
XENDIT_WEBHOOK_TOKEN=webhook_token_xxxxx
XENDIT_IS_PRODUCTION=false
```

**Step 3: Setup Webhook**

In Xendit Dashboard → Settings → Webhooks:
- Invoice Paid: `https://your-api.com/webhooks/payment/xendit`

### 2.3 Manual Bank Transfer

For manual verification:

```env
MANUAL_TRANSFER_BANKS=[{"bank":"BCA","account":"1234567890","name":"PT Brand"}]
```

Admin will verify payments manually through admin panel.

---

## 3. TEMBUS LOGISTICS SETUP

### 3.1 Get API Access

1. Register at Tembus partner portal
2. Complete business verification
3. Get API credentials

### 3.2 Configure Environment

```env
TEMBUS_API_KEY=tb_api_xxxxx
TEMBUS_WEBHOOK_SECRET=webhook_secret_xxxxx
TEMBUS_IS_PRODUCTION=false
TEMBUS_DEFAULT_SERVICE=REG
```

### 3.3 Setup Webhook

In Tembus Dashboard → Webhooks:
- URL: `https://your-api.com/webhooks/logistics/tembus`
- Events: `shipment.created`, `shipment.picked_up`, `shipment.in_transit`, `shipment.delivered`, `shipment.failed`

### 3.4 Available Services

| Service | Code | Est. Delivery | Use Case |
|---------|------|---------------|----------|
| Regular | REG | 3-5 days | Standard delivery |
| Express | EXP | 1-2 days | Fast delivery |
| Same Day | SAME_DAY | Same day | Urgent delivery |
| Next Day | NEXT_DAY | Next day | Next day delivery |
| COD | COD | 3-5 days | Cash on delivery |

---

## 4. FRONTEND INTEGRATION

### 4.1 Authentication Flow

```typescript
// 1. Register/Login
const response = await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

const { data } = await response.json();
const { accessToken, refreshToken } = data.tokens;

// 2. Store tokens
localStorage.setItem('accessToken', accessToken);
localStorage.setItem('refreshToken', refreshToken);

// 3. Use in subsequent requests
const headers = {
  'Authorization': `Bearer ${accessToken}`
};
```

### 4.2 Handling Token Refresh

```typescript
async function fetchWithRefresh(url: string, options: RequestInit = {}) {
  let token = localStorage.getItem('accessToken');

  let response = await fetch(url, {
    ...options,
    headers: { ...options.headers, 'Authorization': `Bearer ${token}` }
  });

  if (response.status === 401) {
    // Token expired, refresh
    const refreshToken = localStorage.getItem('refreshToken');
    const refreshResponse = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (refreshResponse.ok) {
      const { data } = await refreshResponse.json();
      localStorage.setItem('accessToken', data.accessToken);

      // Retry original request
      response = await fetch(url, {
        ...options,
        headers: { ...options.headers, 'Authorization': `Bearer ${data.accessToken}` }
      });
    } else {
      // Refresh failed, redirect to login
      window.location.href = '/login';
    }
  }

  return response;
}
```

### 4.3 Checkout Flow Example

```typescript
// 1. Get shipping rates
const ratesResponse = await fetchWithRefresh('/api/v1/logistics/rates', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    originAddressId: warehouseAddressId,
    destinationAddressId: customerAddressId,
    items: cartItems
  })
});

const { data: rates } = await ratesResponse.json();

// 2. Process checkout
const checkoutResponse = await fetchWithRefresh('/api/v1/checkout/process', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    addressId: customerAddressId,
    shippingMethod: {
      provider: 'tembus',
      service: 'REG'
    },
    paymentMethod: {
      type: 'qris',
      provider: 'midtrans'
    }
  })
});

const { data: order } = await checkoutResponse.json();

// 3. Display QRIS
if (order.payment.qrCodeUrl) {
  showQRISModal(order.payment.qrCodeUrl);
}

// 4. Poll for payment status
const pollInterval = setInterval(async () => {
  const statusResponse = await fetchWithRefresh(`/api/v1/payments/${order.payment.id}/status`);
  const { data: payment } = await statusResponse.json();

  if (payment.status === 'paid') {
    clearInterval(pollInterval);
    showSuccessPage();
  }
}, 3000);
```

### 4.4 WebSocket Integration

```typescript
const ws = new WebSocket(`wss://your-api.com/v1/ws?token=${accessToken}`);

ws.onopen = () => {
  // Subscribe to order updates
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: `order:${orderId}`
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case 'order_update':
      updateOrderStatus(message.data);
      break;
    case 'notification':
      showNotification(message.data);
      break;
  }
};
```

---

## 5. WEBHOOK CONFIGURATION

### 5.1 Payment Webhook Handler

The system automatically handles webhooks at:

```
POST /webhooks/payment/:provider
```

**Supported Providers:** `midtrans`, `xendit`, `stripe`

**Webhook Flow:**
1. Verify signature
2. Check idempotency (webhook_id)
3. Update payment status
4. Trigger order workflow
5. Send notifications

### 5.2 Logistics Webhook Handler

```
POST /webhooks/logistics/:provider
```

**Supported Providers:** `tembus`

**Webhook Events:**
- `shipment.created` → Update order status
- `shipment.picked_up` → Notify customer
- `shipment.in_transit` → Update tracking
- `shipment.delivered` → Complete order, request review
- `shipment.failed` → Alert admin, notify customer

---

## 6. ENVIRONMENT SETUP

### 6.1 Complete .env.example

```env
# ==========================================
# APPLICATION
# ==========================================
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000
APP_NAME=Brand Store Template
APP_VERSION=1.0.0

# ==========================================
# DATABASE
# ==========================================
DATABASE_URL=postgresql://postgres:password@localhost:5432/brand_store
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# ==========================================
# REDIS
# ==========================================
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# ==========================================
# JWT
# ==========================================
JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
...
-----END PUBLIC KEY-----"
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# ==========================================
# STORAGE (S3/MinIO)
# ==========================================
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=brand-store
S3_REGION=us-east-1
S3_USE_SSL=false

# ==========================================
# PAYMENT - MIDTRANS
# ==========================================
MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
MIDTRANS_IS_PRODUCTION=false

# ==========================================
# PAYMENT - XENDIT
# ==========================================
XENDIT_SECRET_KEY=
XENDIT_WEBHOOK_TOKEN=
XENDIT_IS_PRODUCTION=false

# ==========================================
# LOGISTICS - TEMBUS
# ==========================================
TEMBUS_API_KEY=
TEMBUS_WEBHOOK_SECRET=
TEMBUS_IS_PRODUCTION=false
TEMBUS_DEFAULT_SERVICE=REG

# ==========================================
# NOTIFICATIONS
# ==========================================
# FCM (Push)
FCM_SERVER_KEY=
FCM_PROJECT_ID=

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@example.com

# SMS
SMS_PROVIDER=twilio  # or 'vonage', 'messagebird'
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# ==========================================
# FEATURE FLAGS
# ==========================================
FEATURE_FLASH_SALE=true
FEATURE_REFERRAL=false
FEATURE_LIVE_CHAT=true
FEATURE_WALLET=true
FEATURE_BNPL=false

# ==========================================
# ADMIN
# ==========================================
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=ChangeMe123!
```

---

## 7. DEPLOYMENT

### 7.1 Docker Compose (Development)

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/brand_store
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    volumes:
      - ./src:/app/src

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=brand_store
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  minio:
    image: minio/minio
    command: server /data
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    ports:
      - "9000:9000"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  minio_data:
```

### 7.2 Production Deployment

```bash
# Build image
docker build -t brand-store-api:latest .

# Push to registry
docker tag brand-store-api:latest registry.example.com/brand-store-api:latest
docker push registry.example.com/brand-store-api:latest

# Deploy (example with docker-compose)
docker-compose -f docker-compose.prod.yml up -d

# Run migrations
docker-compose exec api bun run db:migrate
```

### 7.3 Health Checks

```bash
# Check API health
curl https://your-api.com/health

# Response
{
  "status": "healthy",
  "timestamp": "2026-11-09T21:00:00Z",
  "checks": {
    "database": "connected",
    "redis": "connected",
    "storage": "connected"
  }
}
```

---

## 8. TROUBLESHOOTING

### Common Issues

| Issue | Solution |
|-------|----------|
| Webhook not received | Check webhook URL is publicly accessible |
| Payment status not updating | Verify webhook signature and logs |
| Shipping rates not showing | Check Tembus API credentials |
| Token refresh failing | Verify JWT keys are correct |
| Database connection error | Check DATABASE_URL and network |

### Debug Mode

```env
LOG_LEVEL=debug
```

---

*End of Integration Guide*
