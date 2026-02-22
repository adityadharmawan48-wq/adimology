-- Migration: Add password protection settings to profile table
-- Keys: password_enabled (default 'false'), password_hash (default '')

INSERT INTO profile (key, value) VALUES ('password_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

INSERT INTO profile (key, value) VALUES ('password_hash', '')
ON CONFLICT (key) DO NOTHING;
