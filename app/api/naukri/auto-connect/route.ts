import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { encrypt } from '@/lib/encryption'

// Naukri's Google Sign-In client_id (extracted from HAR analysis of naukri.com)
// This is what Naukri uses in their GSI flow — credentials issued for THIS client_id
// are accepted by Naukri's backend
const NAUKRI_GSI_CLIENT_ID = '495978633425-tvscej95bp780ok4qb58r90gsfeua30d.apps.googleusercontent.com'

// Naukri login endpoints to try with the GSI credential
const NAUKRI_LOGIN_ENDPOINTS = [
  { url: 'https://www.naukri.com/central-login-services/v1/login/google', body: (c: string) => ({ credential: c }) },
  { url: 'https://www.naukri.com/central-login-services/v0/google-login', body: (c: string) => ({ credential: c }) },
  { url: 'https://www.naukri.com/login/v1/google', body: (c: string) => ({ credential: c, clientId: NAUKRI_GSI_CLIENT_ID }) },
  { url: 'https://www.naukri.com/user-service/v1/google-login', body: (c: string) => ({ credential: c }) },
]

function extractProfile(body: Record<string, unknown>) {
  try {
    const data = (body.data || body.user || body.profile || body) as Record<string, unknown>
    if (!data) return undefined
    const name = (data.fullName || data.name || data.firstName) as string | undefined
    const email = (data.email || data.emailId) as string | undefined
    const profileId = (data.profileId || data.userId || data.id) as string | undefined
    if (!name && !email) return undefined
    return {
      name: name || 'User',
      email: email || '',
      profileId: profileId ? String(profileId) : '',
    }
  } catch { return undefined }
}

// POST with GSI credential from client-side Google One Tap
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { credential } = body  // GSI id_token from client-side Google One Tap with Naukri's client_id

    if (!credential) {
      return NextResponse.json({ error: 'No credential provided', needsCredential: true }, { status: 400 })
    }

    console.log('[auto-connect] Got GSI credential, trying Naukri login endpoints...')

    const commonHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'appid': '105',
      'clientid': 'd3skt0p',
      'systemid': '103',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://www.naukri.com',
      'Referer': 'https://www.naukri.com/',
    }

    let cookieStr = ''
    let profile

    for (const endpoint of NAUKRI_LOGIN_ENDPOINTS) {
      try {
        console.log(`[auto-connect] Trying: ${endpoint.url}`)
        const res = await fetch(endpoint.url, {
          method: 'POST',
          headers: commonHeaders,
          body: JSON.stringify(endpoint.body(credential)),
          redirect: 'manual',
        })

        console.log(`[auto-connect] Status: ${res.status}`)

        const rawCookies: string[] = []
        res.headers.forEach((value, key) => {
          if (key.toLowerCase() === 'set-cookie') rawCookies.push(value)
        })

        let resBody: Record<string, unknown> = {}
        try { resBody = await res.json() } catch {}

        console.log(`[auto-connect] Body keys: ${Object.keys(resBody).join(', ')}`)
        if (rawCookies.length) console.log(`[auto-connect] Got ${rawCookies.length} cookies`)

        // Success
        if ((res.status === 200 || res.status === 201) && rawCookies.length > 0) {
          cookieStr = rawCookies.map(c => c.split(';')[0].trim()).join('; ')
          profile = extractProfile(resBody)
          console.log('[auto-connect] SUCCESS via', endpoint.url)
          break
        }

        // Some endpoints return token in body even without Set-Cookie
        if (res.status === 200 && (resBody.authToken || resBody.token)) {
          const token = resBody.authToken || resBody.token
          cookieStr = `_t=${token}`
          profile = extractProfile(resBody)
          break
        }

      } catch (e) {
        console.log(`[auto-connect] Error on ${endpoint.url}:`, e)
      }
    }

    if (!cookieStr) {
      return NextResponse.json({
        error: 'auto_connect_failed',
        message: 'Naukri rejected the credential. Use manual cookie method.',
        fallbackToManual: true,
      }, { status: 422 })
    }

    // Encrypt and save
    const encryptedCookies = encrypt(cookieStr)
    const updateData: Record<string, unknown> = {
      naukri_cookies_enc: encryptedCookies,
      naukri_connected_at: new Date().toISOString(),
    }
    if (profile?.profileId) updateData.naukri_user_id = profile.profileId
    if (profile?.email) updateData.naukri_email = profile.email

    await supabaseAdmin.from('users').update(updateData).eq('id', session.user.id)

    return NextResponse.json({
      success: true,
      profile: profile || { name: session.user.name || 'User', email: session.user.email || '', profileId: '' },
    })

  } catch (err) {
    console.error('[auto-connect] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('naukri_cookies_enc, naukri_user_id, naukri_email, naukri_connected_at')
      .eq('id', session.user.id)
      .single()
    return NextResponse.json({
      connected: !!(user?.naukri_cookies_enc || user?.naukri_user_id),
      hasWebAuth: !!user?.naukri_cookies_enc,
      naukriEmail: user?.naukri_email,
      connectedAt: user?.naukri_connected_at,
      // Return client_id so frontend knows what to use for GSI
      naukriClientId: NAUKRI_GSI_CLIENT_ID,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
