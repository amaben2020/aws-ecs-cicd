-- Schema for the orders service database (Neon, per-service).
--
-- user_id intentionally has NO foreign key: the users table lives in a
-- separate database, and Postgres cannot enforce a cross-database constraint.
-- Referential integrity between orders and users is the application's
-- responsibility in this split.

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  item VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders (user_id);
