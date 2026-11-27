/**
 * POST /api/naukri/login
 * Connects user's Naukri account
 * - Authenticates with Naukri API (port-login from APK RE)
 * - Fetches profile + CV ID
 * - Encrypts and stores credentials in Supabase
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NaukriClient } from '@/lib/naukri-client'
import { encrypt } from '@/lib/encryption'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const LoginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password too short'),
})

export async function POST(req: NextRequest) {
  // Auth check — must be logged in with Google first
  const session = await getServerSession(authOptions)
  console.log('[NaukriLogin] session:', JSON.stringify({
    hasSession: !!session,
    email: session?.user?.email,
    id: session?.user?.id,
  }))
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated', debug: 'session is null — cookie not forwarded or NEXTAUTH_SECRET mismatch' }, { status: 401 })
  }

  // Validate body
  let body
  try {
    const raw = await req.json()
    body = LoginSchema.parse(raw)
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: String(err) }, { status: 400 })
  }

  // Get internal user ID
  const { data: dbUser, error: userErr } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', session.user.email)
    .single()

  if (userErr || !dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Attempt Naukri login
  const loginResult = await NaukriClient.login(body.email, body.password)

  if (!loginResult.success || !loginResult.token || !loginResult.userId) {
    console.log('[NaukriLogin] Naukri auth failed:', loginResult)
    return NextResponse.json({
      error: loginResult.error || 'Naukri login failed',
      hint: 'Check your Naukri email and password',
      source: 'naukri_api',
    }, { status: 401 })
  }

  // Fetch profile and CV ID in parallel
  const client = new NaukriClient(loginResult.token, loginResult.userId)
  const [profile, cvId] = await Promise.all([
    client.getProfile(),
    client.getCvId(),
  ])

  // Encrypt credentials before storing
  const encryptedPassword = encrypt(body.password)
  const encryptedToken = encrypt(loginResult.token)

  // Update user record in Supabase
  const { error: updateErr } = await supabaseAdmin
    .from('users')
    .update({
      naukri_email: body.email,
      naukri_password_enc: encryptedPassword,
      naukri_token: encryptedToken,
      naukri_user_id: loginResult.userId,
      naukri_cv_id: cvId,
      naukri_profile: profile,
      naukri_connected_at: new Date().toISOString(),
      naukri_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq('id', dbUser.id)

  if (updateErr) {
    console.error('[NaukriLogin] Update error:', updateErr)
    return NextResponse.json({ error: 'Failed to save connection' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    profile: {
      name: profile?.name,
      email: body.email,
      userId: loginResult.userId,
      cvId,
      currentRole: profile?.profileHeadline,
      experience: profile?.experience,
      location: profile?.currentLocation,
    },
  })
}
