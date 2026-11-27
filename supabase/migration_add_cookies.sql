-- Migration: Add Naukri web cookie auth columns
-- Run this in Supabase SQL Editor if you already ran schema.sql

ALTER TABLE users
ADD COLUMN IF NOT EXISTS naukri_cookies_enc TEXT;

COMMENT ON COLUMN users.naukri_cookies_enc IS 'AES-256 encrypted Naukri browser cookies (for users who login via Google)';

ALTER TABLE users
ADD COLUMN IF NOT EXISTS naukri_email TEXT;

COMMENT ON COLUMN users.naukri_email IS 'Email used on Naukri (may differ from Google email)';

ALTER TABLE users
ADD COLUMN IF NOT EXISTS naukri_connected_at TIMESTAMPTZ;

COMMENT ON COLUMN users.naukri_connected_at IS 'When the Naukri account was last connected/refreshed';
