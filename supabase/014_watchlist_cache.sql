-- Migration: Create watchlist cache tables
-- Purpose: Store watchlist groups and items locally to reduce Stockbit API traffic

-- Tabel untuk menyimpan watchlist groups
CREATE TABLE IF NOT EXISTS watchlist_groups (
  id SERIAL PRIMARY KEY,
  watchlist_id INTEGER UNIQUE NOT NULL,   -- ID dari Stockbit
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  is_favorite BOOLEAN DEFAULT FALSE,
  emoji TEXT,
  category_type TEXT,
  total_items INTEGER DEFAULT 0,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabel untuk menyimpan watchlist items (emiten per group)
CREATE TABLE IF NOT EXISTS watchlist_items (
  id SERIAL PRIMARY KEY,
  watchlist_group_id INTEGER NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,
  stockbit_item_id TEXT,                    -- ID item dari Stockbit
  company_id INTEGER,
  company_code TEXT NOT NULL,
  symbol TEXT NOT NULL,
  company_name TEXT,
  last_price NUMERIC,
  percent TEXT,
  sector TEXT,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(watchlist_group_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_items_group ON watchlist_items(watchlist_group_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_symbol ON watchlist_items(symbol);
