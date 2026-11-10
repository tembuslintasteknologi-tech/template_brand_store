import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { unifiedConfig } from '../config/unifiedConfig.js';
import * as schema from './schema.js';

const client = postgres(unifiedConfig.database.url);
export const db = drizzle(client, { schema });
