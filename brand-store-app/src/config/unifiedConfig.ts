import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

export const unifiedConfig = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/brand_store',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'super-secret-brand-store-key-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'super-secret-refresh-key',
    expiresIn: '900s',
    refreshExpiresIn: '604800s',
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
  tembus: {
    apiKey: process.env.TEMBUS_API_KEY || '',
    apiUrl: process.env.TEMBUS_API_URL || 'https://api.tembus.test',
    isProduction: process.env.TEMBUS_IS_PRODUCTION === 'true',
    webhookSecret: process.env.TEMBUS_WEBHOOK_SECRET || '',
    onDemand: {
      baseUrl:
        process.env.TEMBUS_ONDEMAND_BASE_URL ||
        'https://staging-api.bawain.my.id/api/v1/developer/v1',
      models: (process.env.TEMBUS_ONDEMAND_MODELS || 'p2p')
        .split(',')
        .map((model) => model.trim())
        .filter(Boolean),
      timeoutMs: parseInt(process.env.TEMBUS_ONDEMAND_TIMEOUT_MS || '15000', 10),
    },
    aggregator: {
      baseUrl: process.env.TEMBUS_AGGREGATOR_BASE_URL || 'https://staging-api.bawain.my.id',
      token: process.env.TEMBUS_AGGREGATOR_TOKEN || '',
      providers: (process.env.TEMBUS_AGGREGATOR_PROVIDERS || 'jne,jnt')
        .split(',')
        .map((provider) => provider.trim().toLowerCase())
        .filter(Boolean),
      timeoutMs: parseInt(process.env.TEMBUS_AGGREGATOR_TIMEOUT_MS || '15000', 10),
    },
  },
  storage: {
    endpoint: process.env.STORAGE_ENDPOINT || 'localhost',
    port: parseInt(process.env.STORAGE_PORT || '9000', 10),
    bucket: process.env.STORAGE_BUCKET || 'brand-store-uploads',
  },
  brand: {
    name: process.env.BRAND_NAME || 'Brand Store',
    currency: process.env.BRAND_CURRENCY || 'IDR',
    locale: process.env.BRAND_LOCALE || 'id-ID',
    taxPercent: parseFloat(process.env.TAX_PERCENT || '11'),
    paymentExpiryMinutes: parseInt(process.env.PAYMENT_EXPIRY_MINUTES || '1440', 10),
  },
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@brandstore.test',
    password: process.env.ADMIN_PASSWORD || 'AdminPassword123!',
  },
  storeOrigin: {
    name: process.env.STORE_ORIGIN_NAME || 'Main Warehouse',
    phone: process.env.STORE_ORIGIN_PHONE || '+628123456789',
    address: process.env.STORE_ORIGIN_ADDRESS || 'Jl. Sudirman No. 1',
    city: process.env.STORE_ORIGIN_CITY || 'Jakarta Pusat',
    province: process.env.STORE_ORIGIN_PROVINCE || 'DKI Jakarta',
    postalCode: process.env.STORE_ORIGIN_POSTAL_CODE || '10210',
  },
  auth: {
    maxLoginAttempts: 5,
    maxFailedAttempts: 5,
    lockoutDurationMinutes: 15,
    lockTtlSeconds: 900,
  },
  midtrans: {
    serverKey: process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-key',
    clientKey: process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-key',
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  },
};


