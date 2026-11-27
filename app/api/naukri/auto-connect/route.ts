import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { encrypt } from '@/lib/crypto'

// Naukri's Google Sign-In client_id (found in HAR analysis)
const NAUKRI_GSI_CLIENT_ID = '495978633425-tvscej95bp780ok4qb58r90gsfeua30d.apps.googleusercontent.com'

// Known Naukri Google login endpoints to try in order
const NAUKRI_GOOGLE_LOGIN_ENDPOINTS = [
  'https://www.naukri.com/central-login-services/v0/google-login',
  'https://www.naukri.com/login/v1/google',
  'https://www.naukri.com/user-service/v1/google-login',
]

interface NaukriAutoConnectResult {
  success: boolean
  profile?: {
    name: string
    email: string
    profileId: string
    mobile?: string
  }
  error?: string
  method?: string
}

async function tryNaukriGoogleLogin(googleAccessToken: string): Promise<{
  cookies: string
  profile: NaukriAutoConnectResult['profile']
} | null> {

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

  for (const endpoint of NAUKRI_GOOGLE_LOGIN_ENDPOINTS) {
    try {
      console.log(`[auto-connect] Trying endpoint: ${endpoint}`)

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: commonHeaders,
        body: JSON.stringify({
          access_token: googleAccessToken,
          client_id: NAUKRI_GSI_CLIENT_ID,
        }),
        redirect: 'manual',
      })

      console.log(`[auto-connect] Response status: ${res.status} from ${endpoint}`)

      if (res.status === 200 || res.status === 201) {
        // Grab all Set-Cookie headers
        const rawCookies: string[] = []
        res.headers.forEach((value, key) => {
          if (key.toLowerCase() === 'set-cookie') {
            rawCookies.push(value)
          }
        })

        // Also check for cookies in the response body (some APIs return them there)
        let body: Record<string, unknown> = {}
        try {
          body = await res.json()
          console.log('[auto-connect] Response body keys:', Object.keys(body))
        } catch {
          console.log('[auto-connect] No JSON body')
        }

        // Parse cookie string from Set-Cookie headers
        const cookiePairs = rawCookies.map(c => c.split(';')[0].trim()).filter(Boolean)

        // Some Naukri endpoints return a token in body that needs to be used as cookie
        if (body.authToken || body.token || body.access_token) {
          const authToken = body.authToken || body.token || body.access_token
          cookiePairs.push(`_t=${authToken}`)
        }

        if (cookiePairs.length === 0) {
          console.log('[auto-connect] No cookies in response, trying next endpoint')
          continue
        }

        const cookieStr = cookiePairs.join('; ')

        // Extract profile from response body
        const profile = extractProfile(body)

        return { cookies: cookieStr, profile }
      }

      // Handle redirect responses (some login flows redirect)
      if (res.status === 302 || res.status === 301) {
        const location = res.headers.get('location')
        const rawCookies: string[] = []
        res.headers.forEach((value, key) => {
          if (key.toLowerCase() === 'set-cookie') {
            rawCookies.push(value)
          }
        })

        if (rawCookies.length > 0) {
          const cookiePairs = rawCookies.map(c => c.split(';')[0].trim()).filter(Boolean)
          const cookieStr = cookiePairs.join('; ')
          console.log(`[auto-connect] Got cookies via redirect from ${endpoint}`)
          return { cookies: cookieStr, profile: undefined }
        }

        console.log(`[auto-connect] Redirect to ${location}, no cookies captured`)
        continue
      }

    } catch (err) {
      console.log(`[auto-connect] Error on ${endpoint}:`, err)
      continue
    }
  }

  return null
}

// Try alternative: use Google userinfo to get id_token hint, then try Naukri
async function tryWithIdTokenHint(googleAccessToken: string): Promise<{
  cookies: string
  profile: NaukriAutoConnectResult['profile']
} | null> {
  try {
    // Get user info from Google
    const googleRes = await fetch(
      `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${googleAccessToken}`
    )

    if (!googleRes.ok) {
      console.log('[auto-connect] Failed to get Google userinfo:', googleRes.status)
      return null
    }

    const googleUser = await googleRes.json()
    console.log('[auto-connect] Got Google user:', googleUser.email)

    // Try Naukri GSI status endpoint first (this is what the browser hits during Google login)
    // Then try to exchange for Naukri session
    const gsiRes = await fetch(
      `https://accounts.google.com/gsi/status?client_id=${NAUKRI_GSI_CLIENT_ID}&origin=https://www.naukri.com`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.naukri.com/',
        }
      }
    )
    console.log('[auto-connect] GSI status:', gsiRes.status)

    // Try the credential exchange endpoint
    const credential_endpoints = [
      'https://www.naukri.com/central-login-services/v0/google-callback',
      'https://www.naukri.com/login/v1/google/callback',
    ]

    for (const ep of credential_endpoints) {
      try {
        const res = await fetch(ep, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'appid': '105',
            'clientid': 'd3skt0p',
            'systemid': '103',
            'Origin': 'https://www.naukri.com',
            'Referer': 'https://www.naukri.com/',
          },
          body: JSON.stringify({
            access_token: googleAccessToken,
            email: googleUser.email,
            googleId: googleUser.sub,
            name: googleUser.name,
          }),
          redirect: 'manual',
        })

        console.log(`[auto-connect] Callback ${ep}: ${res.status}`)

        if (res.status === 200 || res.status === 201) {
          const rawCookies: string[] = []
          res.headers.forEach((value, key) => {
            if (key.toLowerCase() === 'set-cookie') rawCookies.push(value)
          })

          if (rawCookies.length > 0) {
            const cookieStr = rawCookies.map(c => c.split(';')[0].trim()).join('; ')
            let body: Record<string, unknown> = {}
            try { body = await res.json() } catch {}
            return { cookies: cookieStr, profile: extractProfile(body) }
          }
        }
      } catch (e) {
        console.log(`[auto-connect] Callback error ${ep}:`, e)
      }
    }

    // Last resort: check if Naukri has a "verify google token" endpoint
    const verifyRes = await fetch('https://www.naukri.com/central-login-services/v1/google-verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'appid': '105',
        'clientid': 'd3skt0p',
        'systemid': '103',
        'Origin': 'https://www.naukri.com',
        'Referer': 'https://www.naukri.com/',
      },
      body: JSON.stringify({
        token: googleAccessToken,
        email: googleUser.email,
      }),
      redirect: 'manual',
    })

    console.log('[auto-connect] Verify endpoint:', verifyRes.status)

    if (verifyRes.status === 200) {
      const rawCookies: string[] = []
      verifyRes.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') rawCookies.push(value)
      })
      if (rawCookies.length > 0) {
        const cookieStr = rawCookies.map(c => c.split(';')[0].trim()).join('; ')
        let body: Record<string, unknown> = {}
        try { body = await verifyRes.json() } catch {}
        return { cookies: cookieStr, profile: extractProfile(body) }
      }
    }

  } catch (err) {
    console.log('[auto-connect] idTokenHint flow error:', err)
  }

  return null
}

function extractProfile(body: Record<string, unknown>): NaukriAutoConnectResult['profile'] | undefined {
  try {
    // Various shapes Naukri APIs use
    const data = (body.data || body.user || body.profile || body) as Record<string, unknown>

    if (!data) return undefined

    const name = (data.fullName || data.name || data.firstName) as string | undefined
    const email = (data.email || data.emailId) as string | undefined
    const profileId = (data.profileId || data.userId || data.id) as string | undefined

    if (!name && !email) return undefined

    return {
      name: name || 'Unknown',
      email: email || '',
      profileId: profileId ? String(profileId) : '',
      mobile: data.mobile as string | undefined,
    }
  } catch {
    return undefined
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const googleAccessToken = session.googleAccessToken

    if (!googleAccessToken) {
      return NextResponse.json(
        {
          error: 'No Google access token available. Please sign out and sign in again.',
          needsReauth: true
        },
        { status: 400 }
      )
    }

    console.log('[auto-connect] Starting auto-connect for user:', session.user.email)

    // Try primary Google login flow
    let result = await tryNaukriGoogleLogin(googleAccessToken)

    // If that fails, try alternative approaches
    if (!result) {
      console.log('[auto-connect] Primary flow failed, trying alternative...')
      result = await tryWithIdTokenHint(googleAccessToken)
    }

    if (!result) {
      return NextResponse.json(
        {
          error: 'auto_connect_failed',
          message: 'Could not automatically connect to Naukri. Please use manual cookie method.',
          fallbackToManual: true,
        },
        { status: 422 }
      )
    }

    // Encrypt and save cookies
    const encryptedCookies = encrypt(result.cookies)

    const { data: dbUser, error: dbError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', session.user.id)
      .single()

    if (dbError || !dbUser) {
      return NextResponse.json({ error: 'User not found in database' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {
      naukri_cookies_enc: encryptedCookies,
      naukri_connected_at: new Date().toISOString(),
    }

    if (result.profile?.profileId) {
      updateData.naukri_user_id = result.profile.profileId
    }

    if (result.profile?.email) {
      updateData.naukri_email = result.profile.email
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update(updateData)
      .eq('id', session.user.id)

    if (updateError) {
      console.error('[auto-connect] DB update error:', updateError)
      return NextResponse.json({ error: 'Failed to save connection' }, { status: 500 })
    }

    console.log('[auto-connect] Success! Profile:', result.profile?.name)

    return NextResponse.json({
      success: true,
      profile: result.profile || {
        name: session.user.name || 'User',
        email: session.user.email || '',
        profileId: '',
      },
    })

  } catch (err) {
    console.error('[auto-connect] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET endpoint to check current connection status
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
    })

  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
