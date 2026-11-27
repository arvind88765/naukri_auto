-- ============================================================
-- NaukriAuto — Supabase Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  google_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,

  -- Naukri credentials (encrypted AES-256)
  naukri_email TEXT,
  naukri_password_enc TEXT,       -- AES-256 encrypted
  naukri_token TEXT,              -- session token (encrypted)
  naukri_user_id TEXT,            -- X-Naukri-User-Id header value
  naukri_cv_id TEXT,              -- uniqueId from resman-aggregator
  naukri_profile JSONB,           -- full profile JSON from API
  naukri_connected_at TIMESTAMPTZ,
  naukri_token_expires_at TIMESTAMPTZ,

  -- Resume
  base_resume_text TEXT,          -- raw extracted resume text
  base_resume_url TEXT,           -- if uploaded as file
  resume_updated_at TIMESTAMPTZ,

  -- Job preferences (from onboarding Q&A)
  preferences JSONB DEFAULT '{}'::jsonb,
  -- {
  --   "targetRole": "Software Engineer",
  --   "experience": 3,
  --   "locations": ["Bengaluru", "Pune"],
  --   "minSalary": 800000,
  --   "maxSalary": 1500000,
  --   "wfhPreference": "hybrid",
  --   "skills": ["React", "Node.js"],
  --   "noticePeriod": "1 Month",
  --   "jobTypes": ["full-time"]
  -- }

  -- Auto-apply settings
  auto_apply_enabled BOOLEAN DEFAULT false,
  auto_apply_limit_per_day INTEGER DEFAULT 10,
  min_match_score INTEGER DEFAULT 65,

  -- Metadata
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- JOB APPLY QUEUE
-- ============================================================
CREATE TABLE IF NOT EXISTS apply_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Job details (from Naukri search)
  job_id TEXT NOT NULL,
  job_title TEXT,
  company_name TEXT,
  company_id TEXT,
  location TEXT,
  salary_min BIGINT,
  salary_max BIGINT,
  experience_min INTEGER,
  experience_max INTEGER,
  jd_text TEXT,
  job_url TEXT,
  is_wfh BOOLEAN DEFAULT false,

  -- AI processing
  match_score INTEGER DEFAULT 0,     -- 0-100 AI match score
  tailored_resume JSONB,              -- {summary, skills, bullets}
  ai_analysis TEXT,                   -- why matched/rejected

  -- Status flow: pending → scoring → tailoring → applying → done/failed/skipped
  status TEXT DEFAULT 'pending',
  skip_reason TEXT,

  -- Apply result
  applied_at TIMESTAMPTZ,
  apply_response JSONB,
  apply_error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, job_id)             -- no duplicate applies
);

-- ============================================================
-- APPLY HISTORY (completed)
-- ============================================================
CREATE TABLE IF NOT EXISTS apply_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  job_title TEXT,
  company_name TEXT,
  match_score INTEGER,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT,                        -- 'applied' | 'failed'
  response JSONB
);

-- ============================================================
-- RECRUITER VIEWS CACHE (from profile-performance API)
-- ============================================================
CREATE TABLE IF NOT EXISTS recruiter_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  recruiter_name TEXT,
  company_name TEXT,
  designation TEXT,
  activity_date TIMESTAMPTZ,
  is_new BOOLEAN DEFAULT true,
  raw_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SYNC LOGS (track background job runs)
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  sync_type TEXT,              -- 'job_search' | 'apply_batch' | 'profile_sync'
  status TEXT,                 -- 'running' | 'done' | 'error'
  jobs_found INTEGER DEFAULT 0,
  jobs_applied INTEGER DEFAULT 0,
  jobs_skipped INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_apply_queue_user_status ON apply_queue(user_id, status);
CREATE INDEX idx_apply_queue_created ON apply_queue(created_at DESC);
CREATE INDEX idx_apply_history_user ON apply_history(user_id, applied_at DESC);
CREATE INDEX idx_recruiter_views_user ON recruiter_views(user_id, activity_date DESC);
CREATE INDEX idx_sync_logs_user ON sync_logs(user_id, started_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE apply_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE apply_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruiter_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "users_own_data" ON users FOR ALL USING (google_id = current_setting('app.google_id', true));
CREATE POLICY "queue_own_data" ON apply_queue FOR ALL USING (
  user_id = (SELECT id FROM users WHERE google_id = current_setting('app.google_id', true))
);
CREATE POLICY "history_own_data" ON apply_history FOR ALL USING (
  user_id = (SELECT id FROM users WHERE google_id = current_setting('app.google_id', true))
);
CREATE POLICY "views_own_data" ON recruiter_views FOR ALL USING (
  user_id = (SELECT id FROM users WHERE google_id = current_setting('app.google_id', true))
);
CREATE POLICY "logs_own_data" ON sync_logs FOR ALL USING (
  user_id = (SELECT id FROM users WHERE google_id = current_setting('app.google_id', true))
);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER queue_updated_at BEFORE UPDATE ON apply_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at();
