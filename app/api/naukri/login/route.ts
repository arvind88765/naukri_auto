/**
 * POST /api/naukri/login
 * Connects user's Naukri account via email+password
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NaukriClient } from '@/lib/naukri-client'
import { encrypt } from '@/lib/encryption'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const TAG = '[NaukriLogin]'

const LoginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password too short'),
})

export async function POST(req: NextRequest) {
  console.log(`\n${TAG} ══════════ POST /api/naukri/login ══════════`)

  // ── 1. Session check ──
  const session = await getServerSession(authOptions)
  console.log(`${TAG} [1/5] Session:`, JSON.stringify({
    hasSession: !!session,
    email: session?.user?.email ?? 'MISSING',
    userId: (session?.user as { id?: string })?.id ?? 'MISSING',
  }))

  if (!session?.user?.email) {
    console.error(`${TAG} ✗ No session — user not logged in with Google, or NEXTAUTH_SECRET mismatch`)
    return NextResponse.json({
      error: 'Not authenticated',
      debug: 'getServerSession returned null. Check NEXTAUTH_SECRET in .env.local matches what was used to sign the cookie.',
    }, { status: 401 })
  }

  // ── 2. Parse + validate body ──
  let body: { email: string; password: string }
  try {
    const raw = await req.json()
    console.log(`${TAG} [2/5] Request body email:`, raw?.email, '| password length:', raw?.password?.length ?? 0)
    body = LoginSchema.parse(raw)
  } catch (err) {
    console.error(`${TAG} ✗ Body validation failed:`, err)
    return NextResponse.json({ error: 'Invalid request', details: String(err) }, { status: 400 })
  }

  // ── 3. Lookup internal DB user ──
  console.log(`${TAG} [3/5] Looking up Supabase user for email:`, session.user.email)
  const { data: dbUser, error: userErr } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', session.user.email)
    .single()

  console.log(`${TAG}   → dbUser:`, dbUser ? `id=${dbUser.id}` : 'NOT FOUND', '| error:', userErr?.message ?? 'none')

  if (userErr || !dbUser) {
    console.error(`${TAG} ✗ User not found in Supabase. Did signIn callback run correctly?`)
    return NextResponse.json({ error: 'User not found in DB', debug: userErr?.message }, { status: 404 })
  }

  // ── 4. Naukri login ──
  console.log(`${TAG} [4/5] Calling NaukriClient.login for:`, body.email)
  const loginResult = await NaukriClient.login(body.email, body.password)
  console.log(`${TAG}   → loginResult:`, JSON.stringify({
    success: loginResult.success,
    hasToken: !!loginResult.token,
    hasUserId: !!loginResult.userId,
    error: loginResult.error ?? 'none',
    statusCode: loginResult.statusCode ?? 'n/a',
  }))

  if (!loginResult.success || !loginResult.token || !loginResult.userId) {
    console.error(`${TAG} ✗ Naukri API login failed:`, loginResult.error)
    return NextResponse.json({
      error: loginResult.error || 'Naukri login failed',
      hint: 'Check your Naukri email/password. The account must exist on naukri.com.',
      source: 'naukri_api',
    }, { status: 401 })
  }

  // ── 5. Fetch profile + store ──
  console.log(`${TAG} [5/5] Fetching profile for userId:`, loginResult.userId)
  const client = new NaukriClient(loginResult.token, loginResult.userId)
  const [profile, cvId] = await Promise.all([
    client.getProfile(),
    client.getCvId(),
  ])
  console.log(`${TAG}   → profile name:`, profile?.name ?? 'null', '| cvId:', cvId ?? 'null')

  const encryptedPassword = encrypt(body.password)
  const encryptedToken = encrypt(loginResult.token)

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
    console.error(`${TAG} ✗ Supabase update error:`, updateErr)
    return NextResponse.json({ error: 'Failed to save connection', debug: updateErr.message }, { status: 500 })
  }

  console.log(`${TAG} ✓ SUCCESS — Naukri connected for user:`, session.user.email)
  console.log(`${TAG} ════════════════════════════════════════════\n`)

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
      // Extra fields for auto-prefs extraction (skips the prefs form)
      keySkills: profile?.skills?.join(', ') || '',
      locations: profile?.currentLocation
        ? [{ id: 0, value: profile.currentLocation }]
        : [],
    },
  })
}
