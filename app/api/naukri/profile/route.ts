/**
 * GET /api/naukri/profile
 * Returns current user's Naukri profile + stats
 *
 * PUT /api/naukri/profile/preferences
 * Updates onboarding preferences
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NaukriClient, TokenExpiredError } from '@/lib/naukri-client'
import { decrypt } from '@/lib/encryption'
import { z } from 'zod'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', session.user.email)
    .single()

  if (error || !user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  let liveProfile = null
  let searchImpressions = 0
  let tokenExpired = false

  // Try to get live Naukri data if connected
  if (user.naukri_token && user.naukri_user_id) {
    try {
      const token = decrypt(user.naukri_token)
      const client = new NaukriClient(token, user.naukri_user_id)
      const [profile, impressions] = await Promise.all([
        client.getProfile(),
        client.getSearchImpressions(),
      ])
      liveProfile = profile
      searchImpressions = impressions
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        // Token is dead — wipe it from DB so we don't keep retrying with it
        console.log('[profile GET] token expired — clearing from DB')
        tokenExpired = true
        await supabaseAdmin
          .from('users')
          .update({
            naukri_token: null,
            naukri_cv_id: null,
            naukri_token_expires_at: null,
          })
          .eq('id', user.id)
      }
      // Any other error: fall through to cached data
    }
  }

  // Stats from DB
  const { count: totalApplied } = await supabaseAdmin
    .from('apply_history')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const { count: queuedCount } = await supabaseAdmin
    .from('apply_queue')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'pending')

  // Today's applies
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const { count: todayApplied } = await supabaseAdmin
    .from('apply_history')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('applied_at', today.toISOString())

  return NextResponse.json({
    tokenExpired,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar_url,
      naukriConnected: tokenExpired ? false : !!user.naukri_user_id,
      naukriEmail: user.naukri_email,
      onboardingCompleted: user.onboarding_completed,
      autoApplyEnabled: user.auto_apply_enabled,
      autoApplyLimit: user.auto_apply_limit_per_day,
      minMatchScore: user.min_match_score,
      preferences: user.preferences,
      hasResume: !!user.base_resume_text,
    },
    naukri: {
      profile: liveProfile || user.naukri_profile,
      searchImpressions,
    },
    stats: {
      totalApplied: totalApplied || 0,
      queuedJobs: queuedCount || 0,
      appliedToday: todayApplied || 0,
      dailyLimit: user.auto_apply_limit_per_day,
    },
  })
}

// Update preferences
const PrefsSchema = z.object({
  targetRole: z.string().min(2).optional(),
  experience: z.number().min(0).max(50).optional(),
  locations: z.array(z.string()).optional(),
  minSalary: z.number().optional(),
  maxSalary: z.number().optional(),
  wfhPreference: z.enum(['full-wfh', 'hybrid', 'office']).optional(),
  skills: z.array(z.string()).optional(),
  noticePeriod: z.string().optional(),
  autoApplyEnabled: z.boolean().optional(),
  autoApplyLimit: z.number().min(1).max(50).optional(),
  minMatchScore: z.number().min(0).max(100).optional(),
  baseResume: z.string().optional(),
  onboardingCompleted: z.boolean().optional(),
})

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body
  try {
    body = PrefsSchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: 'Invalid data', details: String(err) }, { status: 400 })
  }

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, preferences')
    .eq('email', session.user.email)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const updateData: Record<string, unknown> = {}

  // Merge preferences
  if (body.targetRole || body.experience !== undefined || body.locations || body.skills ||
      body.minSalary || body.maxSalary || body.wfhPreference || body.noticePeriod) {
    updateData.preferences = {
      ...user.preferences,
      ...(body.targetRole && { targetRole: body.targetRole }),
      ...(body.experience !== undefined && { experience: body.experience }),
      ...(body.locations && { locations: body.locations }),
      ...(body.minSalary && { minSalary: body.minSalary }),
      ...(body.maxSalary && { maxSalary: body.maxSalary }),
      ...(body.wfhPreference && { wfhPreference: body.wfhPreference }),
      ...(body.skills && { skills: body.skills }),
      ...(body.noticePeriod && { noticePeriod: body.noticePeriod }),
    }
  }

  if (body.autoApplyEnabled !== undefined) updateData.auto_apply_enabled = body.autoApplyEnabled
  if (body.autoApplyLimit) updateData.auto_apply_limit_per_day = body.autoApplyLimit
  if (body.minMatchScore !== undefined) updateData.min_match_score = body.minMatchScore
  if (body.baseResume) {
    updateData.base_resume_text = body.baseResume
    updateData.resume_updated_at = new Date().toISOString()
  }
  if (body.onboardingCompleted !== undefined) updateData.onboarding_completed = body.onboardingCompleted

  const { error } = await supabaseAdmin.from('users').update(updateData).eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: 'Update failed', details: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
