-- Migration: Normalize watchlist cache tables
-- Purpose: Move emiten details to a separate table to avoid redundancy

-- 1. Create emiten_cache table
CREATE TABLE IF NOT EXISTS emiten_cache (
  symbol TEXT PRIMARY KEY,
  name TEXT,
  sector TEXT,
  last_price NUMERIC,
  percent TEXT,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Modify watchlist_items to be simpler
-- Since it's a cache table, it's easier to drop and recreate for clean normalization
DROP TABLE IF EXISTS watchlist_items;

CREATE TABLE watchlist_items (
  id SERIAL PRIMARY KEY,
  watchlist_group_id INTEGER NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL REFERENCES emiten_cache(symbol) ON DELETE CASCADE,
  stockbit_item_id TEXT,                    -- ID item dari Stockbit
  company_id INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(watchlist_group_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_items_group ON watchlist_items(watchlist_group_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_symbol ON watchlist_items(symbol);

-- 3. Cleanup: If there were records in the old table that we can migrate to emiten_cache (optional, but good practice)
-- However, since the user said last_price was empty, we probably just want a fresh sync.
-- The existing code will handle re-syncing from Stockbit and populating these tables.
