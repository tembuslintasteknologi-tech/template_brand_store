import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

export const unifiedConfig = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/brand_store',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'super-secret-brand-store-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
  tembus: {
    apiKey: process.env.TEMBUS_API_KEY || '',
    apiUrl: process.env.TEMBUS_API_URL || 'https://api.tembus.test',
  }
};
