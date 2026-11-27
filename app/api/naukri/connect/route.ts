/**
 * POST /api/naukri/connect
 * Connect Naukri account using browser cookies
 * - User copies cookies from DevTools after logging in via Google on naukri.com
 * - We verify cookies work, fetch profile, then save encrypted cookies
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NaukriWebClient } from '@/lib/naukri-web-client'
import { encrypt } from '@/lib/encryption'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const ConnectSchema = z.object({
  cookieStr: z.string().min(10, 'Cookie string too short'),
})

export async function POST(req: NextRequest) {
  // Must be logged in with Google first
  const session = await getServerSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body
  try {
    const raw = await req.json()
    body = ConnectSchema.parse(raw)
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: String(err) }, { status: 400 })
  }

  // Verify cookies work and get profile
  const webClient = new NaukriWebClient(body.cookieStr)
  const result = await webClient.verifyAndGetProfile()

  if (!result.success || !result.profile) {
    return NextResponse.json({
      error: result.error || 'Could not verify Naukri session',
    }, { status: 401 })
  }

  // Get internal user record
  const { data: dbUser, error: userErr } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', session.user.email)
    .single()

  if (userErr || !dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Encrypt cookies before storing
  const encryptedCookies = encrypt(body.cookieStr)

  // Save to Supabase
  const { error: updateErr } = await supabaseAdmin
    .from('users')
    .update({
      naukri_email: result.profile.email || session.user.email,
      naukri_cookies_enc: encryptedCookies,
      naukri_user_id: result.profile.profileId,
      naukri_cv_id: result.profile.profileId, // use profileId as cv reference
      naukri_profile: result.profile,
      naukri_connected_at: new Date().toISOString(),
      // Cookies typically last 30 days on Naukri
      naukri_token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq('id', dbUser.id)

  if (updateErr) {
    console.error('[NaukriConnect] Update error:', updateErr)
    return NextResponse.json({ error: 'Failed to save connection' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    profile: {
      name: result.profile.name,
      email: result.profile.email,
      profileId: result.profile.profileId,
      resumeHeadline: result.profile.resumeHeadline,
      keySkills: result.profile.keySkills,
      experience: result.profile.experience,
      locations: result.profile.locations,
      cvInfo: result.profile.cvInfo,
      noticePeriod: result.profile.noticePeriod,
    },
  })
}
