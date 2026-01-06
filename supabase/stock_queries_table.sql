-- Create stock_queries table
CREATE TABLE IF NOT EXISTS stock_queries (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  emiten TEXT NOT NULL,
  from_date DATE,
  to_date DATE,
  bandar TEXT,
  barang_bandar NUMERIC,
  rata_rata_bandar NUMERIC,
  harga NUMERIC,
  ara NUMERIC,
  arb NUMERIC,
  fraksi NUMERIC,
  total_bid NUMERIC,
  total_offer NUMERIC,
  total_papan NUMERIC,
  rata_rata_bid_ofer NUMERIC,
  a NUMERIC,
  p NUMERIC,
  target_realistis NUMERIC,
  target_max NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_stock_queries_emiten ON stock_queries(emiten);
