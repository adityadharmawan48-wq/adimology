-- Create session table for storing key-value pairs like tokens
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS session (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster key lookup
CREATE INDEX IF NOT EXISTS idx_session_key ON session(key);

-- Enable Row Level Security (optional, adjust based on your needs)
-- ALTER TABLE session ENABLE ROW LEVEL SECURITY;

-- Example: Allow all operations for service role (adjust as needed)
-- CREATE POLICY "Allow all for service role" ON session
--   USING (true)
--   WITH CHECK (true);
