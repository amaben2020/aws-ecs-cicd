import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/schema.ts';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Pass the schema object to unlock Relational Queries API capabilities
export const db = drizzle({ client: pool, schema });
