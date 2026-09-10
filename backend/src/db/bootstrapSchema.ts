import { sql } from "../lib/db";

export async function ensureSchemaCompatibility() {
  await sql.unsafe(`
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS stock_data_source TEXT NOT NULL DEFAULT 'simulated';
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS stock_data_config JSONB;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS allow_user_influence BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS password TEXT;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS join_code TEXT;

    ALTER TABLE orders ADD COLUMN IF NOT EXISTS competition_id UUID;

    ALTER TABLE orders ALTER COLUMN ticker TYPE TEXT;
    ALTER TABLE holdings ALTER COLUMN ticker TYPE TEXT;
    ALTER TABLE competition_holdings ALTER COLUMN ticker TYPE TEXT;

    -- Starting virtual balance bumped to ₹10,00,000 for new signups.
    ALTER TABLE users ALTER COLUMN virtual_balance SET DEFAULT '1000000.00';

    -- Access Key: a 4-digit PIN alternate credential, alongside the password.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS access_key_hash VARCHAR(255);

    -- Deposits: audit log of "add money" top-ups, used in account statements.
    CREATE TABLE IF NOT EXISTS deposits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount NUMERIC(15,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Named watchlists: a user can keep several distinct tracking lists.
    CREATE TABLE IF NOT EXISTS watchlist_lists (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, name)
    );

    -- WebAuthn credentials: registered biometric authenticators (fingerprint /
    -- Touch ID / Windows Hello) that can be used instead of a password or access key.
    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter NUMERIC(20,0) NOT NULL DEFAULT 0,
      device_type VARCHAR(32) NOT NULL DEFAULT 'singleDevice',
      backed_up BOOLEAN NOT NULL DEFAULT false,
      transports TEXT,
      nickname VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS webauthn_credentials_user_id_idx ON webauthn_credentials(user_id);
  `);

  // Migrate the watchlist table from its old flat (user_id, ticker) shape to
  // the new (list_id, ticker) shape backed by watchlist_lists, if needed.
  const watchlistColumns = await sql<{ columnName: string }[]>`
    SELECT column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'watchlist'
  `;
  const watchlistColumnNames = new Set(watchlistColumns.map((c) => c.columnName));

  if (watchlistColumnNames.size === 0) {
    // First run ever — create the new shape directly.
    await sql.unsafe(`
      CREATE TABLE watchlist (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        list_id UUID NOT NULL REFERENCES watchlist_lists(id) ON DELETE CASCADE,
        ticker TEXT NOT NULL,
        target_price NUMERIC(12,4),
        notes TEXT,
        added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(list_id, ticker)
      );
    `);
  } else if (watchlistColumnNames.has("user_id") && !watchlistColumnNames.has("list_id")) {
    // Old flat shape exists — fold every user's items into a default
    // "My Watchlist" list, then reshape the table.
    await sql.unsafe(`
      INSERT INTO watchlist_lists (user_id, name)
      SELECT DISTINCT user_id, 'My Watchlist' FROM watchlist
      ON CONFLICT (user_id, name) DO NOTHING;

      ALTER TABLE watchlist ADD COLUMN list_id UUID REFERENCES watchlist_lists(id) ON DELETE CASCADE;

      UPDATE watchlist w
      SET list_id = wl.id
      FROM watchlist_lists wl
      WHERE wl.user_id = w.user_id AND wl.name = 'My Watchlist';

      ALTER TABLE watchlist ALTER COLUMN list_id SET NOT NULL;
      ALTER TABLE watchlist DROP COLUMN user_id CASCADE;
      ALTER TABLE watchlist ADD CONSTRAINT watchlist_list_id_ticker_unique UNIQUE(list_id, ticker);
    `);
  }

  const tickerColumn = await sql<{ dataType: string }[]>`
    SELECT data_type AS "dataType"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'price_ticks'
      AND column_name = 'ticker'
  `;

  const tickerType = tickerColumn[0]?.dataType?.toLowerCase();
  if (tickerType && tickerType !== "text") {
    // This must NOT run in an explicit transaction because Timescale continuous
    // aggregate creation fails inside transaction blocks.
    await sql.unsafe(`DROP MATERIALIZED VIEW IF EXISTS ohlc_1m;`);
    await sql.unsafe(`DROP MATERIALIZED VIEW IF EXISTS ohlc_5m;`);

    await sql.unsafe(`
      ALTER TABLE price_ticks
      ALTER COLUMN ticker TYPE TEXT;
    `);

    await sql.unsafe(`
      CREATE MATERIALIZED VIEW ohlc_1m
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
    `);

    await sql.unsafe(`
      CREATE MATERIALIZED VIEW ohlc_5m
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
    `);
  }

  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'competitions_join_code_unique'
      ) THEN
        CREATE UNIQUE INDEX competitions_join_code_unique
        ON competitions(join_code)
        WHERE join_code IS NOT NULL;
      END IF;
    END $$;
  `);
}