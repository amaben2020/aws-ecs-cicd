-- Schema for the users service database (Neon, per-service).
-- Local docker-compose uses init-db/init.sql instead, which puts both tables
-- in one database and can therefore keep the orders -> users foreign key.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
