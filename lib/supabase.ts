import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Client-side Supabase (uses anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side Supabase (bypasses RLS — use only in API routes)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// Types matching our schema
export type User = {
  id: string
  google_id: string
  email: string
  name: string | null
  avatar_url: string | null
  naukri_email: string | null
  naukri_password_enc: string | null
  naukri_token: string | null
  naukri_user_id: string | null
  naukri_cv_id: string | null
  naukri_profile: NaukriProfile | null
  naukri_connected_at: string | null
  naukri_token_expires_at: string | null
  base_resume_text: string | null
  preferences: UserPreferences
  auto_apply_enabled: boolean
  auto_apply_limit_per_day: number
  min_match_score: number
  onboarding_completed: boolean
  created_at: string
  updated_at: string
}

export type UserPreferences = {
  targetRole?: string
  experience?: number
  locations?: string[]
  minSalary?: number
  maxSalary?: number
  wfhPreference?: 'full-wfh' | 'hybrid' | 'office'
  skills?: string[]
  noticePeriod?: string
  jobTypes?: string[]
}

export type NaukriProfile = {
  userId?: string
  name?: string
  email?: string
  mobile?: string
  profileHeadline?: string
  experience?: number
  currentSalary?: number
  expectedSalary?: number
  skills?: string[]
  location?: string
  resumeUrl?: string
}

export type ApplyQueueItem = {
  id: string
  user_id: string
  job_id: string
  job_title: string | null
  company_name: string | null
  location: string | null
  salary_min: number | null
  salary_max: number | null
  jd_text: string | null
  job_url: string | null
  match_score: number
  tailored_resume: TailoredResume | null
  status: 'pending' | 'scoring' | 'tailoring' | 'applying' | 'done' | 'failed' | 'skipped'
  skip_reason: string | null
  applied_at: string | null
  apply_error: string | null
  created_at: string
}

export type TailoredResume = {
  summary: string
  skills: string[]
  optimizedBullets: string[]
  matchedKeywords: string[]
}
