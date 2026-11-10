import { defineConfig } from 'drizzle-kit';
import { unifiedConfig } from './src/config/unifiedConfig';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: unifiedConfig.database.url,
  },
});
