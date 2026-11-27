-- Migration: Add resume_structured column for LaTeX-style resume builder
-- Run this in Supabase SQL editor

ALTER TABLE users
ADD COLUMN IF NOT EXISTS resume_structured JSONB DEFAULT NULL;

COMMENT ON COLUMN users.resume_structured IS 'Structured resume data for LaTeX-style resume builder (JSON with education, skills, projects etc.)';
