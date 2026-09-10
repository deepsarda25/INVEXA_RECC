CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'educator', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE order_type AS ENUM ('market', 'limit', 'stop_loss');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE order_side AS ENUM ('buy', 'sell');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending', 'filled', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE competition_status AS ENUM ('draft', 'active', 'ended');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  access_key_hash TEXT,
  virtual_balance NUMERIC(15,2) NOT NULL DEFAULT 1000000.00,
  role user_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_ticks (
  time TIMESTAMPTZ NOT NULL,
  ticker TEXT NOT NULL,
  price NUMERIC(12,4) NOT NULL,
  volume INTEGER NOT NULL,
  PRIMARY KEY (time, ticker)
);

SELECT create_hypertable('price_ticks', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 hour');

CREATE MATERIALIZED VIEW IF NOT EXISTS ohlc_1m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 minute', time) AS bucket,
  ticker,
  first(price, time) AS open,
  max(price) AS high,
  min(price) AS low,
  last(price, time) AS close,
  sum(volume) AS volume
FROM price_ticks
GROUP BY bucket, ticker;

CREATE MATERIALIZED VIEW IF NOT EXISTS ohlc_5m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('5 minute', time) AS bucket,
  ticker,
  first(price, time) AS open,
  max(price) AS high,
  min(price) AS low,
  last(price, time) AS close,
  sum(volume) AS volume
FROM price_ticks
GROUP BY bucket, ticker;

SELECT add_retention_policy('price_ticks', INTERVAL '7 days', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  type order_type NOT NULL,
  side order_side NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  limit_price NUMERIC(12,4),
  status order_status NOT NULL DEFAULT 'pending',
  filled_price NUMERIC(12,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_user_created_at ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_ticker ON orders(status, ticker);

CREATE TABLE IF NOT EXISTS holdings (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  avg_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ticker)
);

CREATE TABLE IF NOT EXISTS competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  start_balance NUMERIC(15,2) NOT NULL DEFAULT 10000.00,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status competition_status NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competition_participants (
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  virtual_balance NUMERIC(15,2) NOT NULL,
  rank INTEGER,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (competition_id, user_id)
);

CREATE TABLE IF NOT EXISTS competition_holdings (
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  avg_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (competition_id, user_id, ticker)
);
