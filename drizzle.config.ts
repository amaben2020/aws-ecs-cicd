import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './db/migrations',
  schema: './db/schema/schema.ts',
  dialect: 'postgresql', // Use 'mysql' or 'sqlite' depending on your DB
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
