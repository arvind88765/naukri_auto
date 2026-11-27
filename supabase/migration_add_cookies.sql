-- Migration: Add naukri_cookies_enc column for web cookie auth
-- Run this in Supabase SQL Editor if you already ran schema.sql

ALTER TABLE users
ADD COLUMN IF NOT EXISTS naukri_cookies_enc TEXT;

COMMENT ON COLUMN users.naukri_cookies_enc IS 'AES-256 encrypted Naukri browser cookies (for users who login via Google)';
