/**
 * NaukriClient — API client built from reverse engineering Naukri APK v22.3
 *
 * Key discoveries from RE:
 * - Gateway base: https://www.nma.mobi (all microservices)
 * - Auth header: X-Naukri-User-Id + Authorization Bearer token
 * - Login: central-login-services/v0/port-login
 * - Profile: cloudgateway-mynaukri/resman-aggregator-services/v0/users/self
 * - Apply: cloudgateway-apply/job-apply-services/v0/jobs/{id}/apply
 * - CV ID: cloudgateway-mynaukri/resman-aggregator-services/v0/uniqueId
 * - Search impressions: cloudgateway-apply/profile-performance/v0/jobseeker/self/search-impressions
 */

const NMA_BASE = 'https://www.nma.mobi'
const NAUKRI_BASE = 'https://www.naukri.com'

// Known API path segments from APK reverse engineering
const PATHS = {
  LOGIN:               '/central-login-services/v0/port-login',
  WEB_LOGIN:           '/central-login-services/v0/applogin?redirectTo=/',
  USERS_SELF:          '/cloudgateway-mynaukri/resman-aggregator-services/v0/users/self',
  USERS_SELF_V1:       '/cloudgateway-mynaukri/resman-aggregator-services/v1/users/self',
  UNIQUE_ID:           '/cloudgateway-mynaukri/resman-aggregator-services/v0/uniqueId',
  ACTIVITY_LEVEL:      '/cloudgateway-mynaukri/resman-aggregator-services/v0/users/self/activityLevel',
  PROFILE_PHOTO:       '/cloudgateway-mynaukri/resman-aggregator-services/v0/users/self/profiles/{profileId}/photo',
  SEARCH_IMPRESSIONS:  '/cloudgateway-apply/profile-performance/v0/jobseeker/self/search-impressions',
  CLICK_TRACK:         '/cloudgateway-ccs/url-shortener-services/v0/track/click-track',
  NOTIFICATION_TMPL:   '/cloudgateway-nc-js/nc-services/v0/template/',
  AIDO_BASE:           '/cloudgateway-naukri360/micro-learning-services/v0/api/v1/',
  // Job search — standard Naukri web API
  JOB_SEARCH:          '/jobapi/v2/list',
  // Apply flow — from SDUIApplyRenderActivity + postApplyBottomSheet RE
  JOB_APPLY:           '/apply-aggregator/job-apply/v0/jobs',
  // Recruiter actions — RecruiterActionService from DEX
  RECRUITER_ACTIONS:   '/cloudgateway-mynaukri/resman-aggregator-services/v0/users/self/recruiterActions',
}

export type LoginResult = {
  success: boolean
  token?: string
  userId?: string
  error?: string
  statusCode?: number
}

export type JobSearchResult = {
  jobDetails: NaukriJob[]
  noOfJobs: number
  urlWord?: string
}

export type NaukriJob = {
  jobId: string
  title: string
  companyName: string
  companyId?: string
  placeholders?: {
    label: string
    type: string
  }[]
  location?: string
  salary?: string
  experience?: string
  jdURL?: string
  footerPlaceHolders?: { label: string }[]
  ambitionBoxData?: { rating: number }
  tagsAndSkills?: string
  jobDescription?: string
  createdDate?: string
  modifiedDate?: string
  isEasyApply?: boolean
  applyRedirectUrl?: string
  staticUrl?: string
  jobType?: string
  workMode?: string        // wfhDetail from SDUI jd
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
  currentLocation?: string
  resumeUrl?: string
  profileScore?: number
}

export type ApplyResult = {
  success: boolean
  applicationId?: string
  error?: string
  alreadyApplied?: boolean
}

/**
 * Try to extract userId from nauk_at JWT token (base64 payload)
 * Naukri encodes userId/sub in the JWT claims
 */
function _extractUserIdFromToken(token: string): string | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return payload.userId || payload.sub || payload.id || payload.user_id || null
  } catch {
    return null
  }
}

export class NaukriClient {
  private token: string
  private userId: string
  private deviceId: string

  constructor(token: string, userId: string, deviceId?: string) {
    this.token = token
    this.userId = userId
    this.deviceId = deviceId || `android-${Date.now()}`
  }

  /**
   * Build web API headers — nauk_at token is sent as a cookie (web flow)
   * Also include Authorization Bearer as fallback for NMA mobile API
   */
  private headers(extra?: Record<string, string>): HeadersInit {
    return {
      'Authorization': `Bearer ${this.token}`,
      'X-Naukri-User-Id': this.userId,
      'Cookie': `nauk_at=${this.token}`,
      'Content-Type': 'application/json',
      'appid': '105',
      'clientid': 'd3skt0p',
      'systemid': 'jobseeker',
      'x-requested-with': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://www.naukri.com',
      'Referer': 'https://www.naukri.com/',
      ...extra,
    }
  }

  /**
   * LOGIN — reverse-engineered from NopeRi (tested Nov 2026, working)
   *
   * KEY DISCOVERIES:
   * 1. Body is FLAT {username, password} — NO loginDetails wrapper, NO loginType
   * 2. systemid must be "jobseeker" not "103"
   * 3. x-requested-with: XMLHttpRequest is required
   * 4. Bearer token lives in nauk_at COOKIE, not JSON body
   * 5. Must GET naukri login page first to establish session cookies
   * 6. v1 endpoint is correct (not v0)
   */
  static async login(email: string, password: string): Promise<LoginResult> {
    const L = '[NaukriClient.login]'

    // ── Step 0: GET login page to establish session cookies ──
    let sessionCookies = ''
    try {
      console.log(`${L} → Step 0: fetching session cookies from naukri.com/nlogin/login`)
      const preRes = await fetch('https://www.naukri.com/nlogin/login', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
      // Collect all set-cookie headers
      const rawCookies = preRes.headers.getSetCookie?.() ?? []
      if (rawCookies.length) {
        sessionCookies = rawCookies.map((c: string) => c.split(';')[0]).join('; ')
        console.log(`${L}   → got ${rawCookies.length} cookies`)
      } else {
        // Fallback: single set-cookie header
        const single = preRes.headers.get('set-cookie')
        if (single) {
          sessionCookies = single.split(';')[0]
          console.log(`${L}   → got 1 cookie (fallback)`)
        }
      }
    } catch (err) {
      console.log(`${L}   → pre-GET failed (continuing without cookies): ${err}`)
    }

    // ── Base headers from NopeRi source (working Nov 2026) ──
    const BASE_HEADERS: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'appid': '105',
      'clientid': 'd3skt0p',
      'systemid': 'jobseeker',       // ← MUST be "jobseeker" not "103"
      'x-requested-with': 'XMLHttpRequest',   // ← REQUIRED by Naukri
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Origin': 'https://www.naukri.com',
      'Referer': 'https://www.naukri.com/nlogin/login',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    }
    if (sessionCookies) BASE_HEADERS['Cookie'] = sessionCookies

    // ── Helper: POST and get response + cookies ──
    const tryPost = async (label: string, url: string, body: Record<string, unknown>, extraHeaders?: Record<string, string>) => {
      console.log(`${L} ── ${label} ──`)
      console.log(`${L}   POST ${url}`)
      const bodyStr = JSON.stringify(body)
      console.log(`${L}   → sending body: ${bodyStr}`)
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { ...BASE_HEADERS, ...extraHeaders },
          body: bodyStr,
        })
        const raw = await res.text()
        console.log(`${L}   → HTTP ${res.status}`)
        console.log(`${L}   → response body: ${raw.slice(0, 600)}`)

        // Extract cookies from response (token is in nauk_at cookie)
        let cookieToken: string | null = null
        try {
          const setCookies = res.headers.getSetCookie?.() ?? []
          const allCookieStr = setCookies.length
            ? setCookies.join('; ')
            : (res.headers.get('set-cookie') ?? '')
          console.log(`${L}   → set-cookie headers: ${allCookieStr.slice(0, 300)}`)
          const naukatMatch = allCookieStr.match(/nauk_at=([^;,\s]+)/)
          cookieToken = naukatMatch?.[1] ?? null
          if (cookieToken) console.log(`${L}   → nauk_at cookie found: ${cookieToken.slice(0, 30)}...`)
        } catch { /* ignore */ }

        const isJson = raw.trim().startsWith('{') || raw.trim().startsWith('[')
        const data = isJson ? (JSON.parse(raw) as Record<string, unknown>) : null
        if (data) console.log(`${L}   → JSON keys: ${Object.keys(data).join(', ')}`)

        return { ok: res.ok, status: res.status, data, raw, cookieToken }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`${L}   → threw: ${msg}`)
        return { ok: false, status: 0, data: null, raw: msg, cookieToken: null }
      }
    }

    // ── Helper: extract token + userId from JSON response ──
    const extractFromJson = (data: Record<string, unknown>) => {
      const d = (data?.data ?? {}) as Record<string, unknown>
      const token =
        (data.authToken as string) || (data.token as string) || (data.access_token as string) ||
        (d.authToken as string) || (d.token as string) || (d.access_token as string)
      const userId =
        (data.userId as string) || (data.user_id as string) || (data.id as string) ||
        (d.userId as string) || (d.id as string) || (data.sub as string)
      return { token: token || null, userId: userId ? String(userId) : null }
    }

    // ══════════════════════════════════════════════════════════════
    // ATTEMPT 1: v1 flat body {username, password} — the working way
    // Source: NopeRi naukri_client.py (tested Nov 2026)
    // ══════════════════════════════════════════════════════════════
    {
      const r = await tryPost(
        'Attempt 1: v1 FLAT body {username, password} [NopeRi method]',
        `${NAUKRI_BASE}/central-login-services/v1/login`,
        { username: email, password },
      )
      const cookieToken = r.cookieToken
      const { token: jsonToken, userId } = r.data ? extractFromJson(r.data) : { token: null, userId: null }
      const token = cookieToken || jsonToken
      console.log(`${L}   → token: ${token?.slice(0, 20) ?? 'null'} (cookie=${!!cookieToken} json=${!!jsonToken}) | userId: ${userId ?? 'null'}`)
      if ((r.ok || cookieToken) && token) {
        // userId might be in cookie data or json — also try extracting from nauk_at JWT
        const finalUserId = userId || _extractUserIdFromToken(token)
        if (finalUserId) {
          console.log(`${L} ✓ SUCCESS via attempt 1 (v1 flat body)`)
          return { success: true, token, userId: finalUserId }
        }
        // token exists but no userId - still return success, caller can fetch profile
        if (token) {
          console.log(`${L} ✓ SUCCESS via attempt 1 (token only, no userId yet)`)
          return { success: true, token, userId: userId || '' }
        }
      }
      if (r.data) {
        const errMsg = (r.data.message as string) || `HTTP ${r.status}`
        console.log(`${L}   → attempt 1 failed: ${errMsg}`)
        // If it's a real auth error (wrong credentials), bubble up immediately
        if (r.status === 401 || (errMsg && (errMsg.toLowerCase().includes('invalid') || errMsg.toLowerCase().includes('incorrect') || errMsg.toLowerCase().includes('wrong')))) {
          return { success: false, error: errMsg, statusCode: r.status }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // ATTEMPT 2: v0 flat body {username, password}
    // ══════════════════════════════════════════════════════════════
    {
      const r = await tryPost(
        'Attempt 2: v0 FLAT body {username, password}',
        `${NAUKRI_BASE}/central-login-services/v0/login`,
        { username: email, password },
      )
      const cookieToken = r.cookieToken
      const { token: jsonToken, userId } = r.data ? extractFromJson(r.data) : { token: null, userId: null }
      const token = cookieToken || jsonToken
      console.log(`${L}   → token: ${token?.slice(0, 20) ?? 'null'} | userId: ${userId ?? 'null'}`)
      if ((r.ok || cookieToken) && token) {
        const finalUserId = userId || _extractUserIdFromToken(token)
        console.log(`${L} ✓ SUCCESS via attempt 2 (v0 flat body)`)
        return { success: true, token, userId: finalUserId || userId || '' }
      }
      if (r.data) console.log(`${L}   → attempt 2 failed: ${(r.data.message as string) || `HTTP ${r.status}`}`)
    }

    // ══════════════════════════════════════════════════════════════
    // ATTEMPT 3: v1 flat body, appid=103 (alternate appid)
    // ══════════════════════════════════════════════════════════════
    {
      const r = await tryPost(
        'Attempt 3: v1 flat body appid=103',
        `${NAUKRI_BASE}/central-login-services/v1/login`,
        { username: email, password },
        { 'appid': '103' },
      )
      const cookieToken = r.cookieToken
      const { token: jsonToken, userId } = r.data ? extractFromJson(r.data) : { token: null, userId: null }
      const token = cookieToken || jsonToken
      console.log(`${L}   → token: ${token?.slice(0, 20) ?? 'null'} | userId: ${userId ?? 'null'}`)
      if ((r.ok || cookieToken) && token) {
        console.log(`${L} ✓ SUCCESS via attempt 3 (appid=103)`)
        return { success: true, token, userId: userId || '' }
      }
      if (r.data) console.log(`${L}   → attempt 3 failed: ${(r.data.message as string) || `HTTP ${r.status}`}`)
    }

    // ══════════════════════════════════════════════════════════════
    // ATTEMPT 4: v1 nested loginDetails (old format, last resort)
    // ══════════════════════════════════════════════════════════════
    {
      const r = await tryPost(
        'Attempt 4: v1 nested loginDetails.username (old format)',
        `${NAUKRI_BASE}/central-login-services/v1/login`,
        { loginDetails: { username: email, password }, loginType: 'emailLogin' },
      )
      const cookieToken = r.cookieToken
      const { token: jsonToken, userId } = r.data ? extractFromJson(r.data) : { token: null, userId: null }
      const token = cookieToken || jsonToken
      console.log(`${L}   → token: ${token?.slice(0, 20) ?? 'null'} | userId: ${userId ?? 'null'}`)
      if ((r.ok || cookieToken) && token) {
        console.log(`${L} ✓ SUCCESS via attempt 4 (nested)`)
        return { success: true, token, userId: userId || '' }
      }
      const errMsg = r.data ? ((r.data.message as string) || `HTTP ${r.status}`) : `HTTP ${r.status}`
      console.log(`${L}   → attempt 4 failed: ${errMsg}`)
      return { success: false, error: errMsg, statusCode: r.status }
    }
  }

  /**
   * GET FULL PROFILE — resman-aggregator-services
   * nauk_at token is cookie-based, web endpoints need cookie auth
   */
  async getProfile(): Promise<NaukriProfile | null> {
    const L = '[NaukriClient.getProfile]'
    const endpoints = [
      `${NAUKRI_BASE}${PATHS.USERS_SELF}`,
      `${NAUKRI_BASE}${PATHS.USERS_SELF_V1}`,
      `${NMA_BASE}${PATHS.USERS_SELF}`,
    ]
    for (const url of endpoints) {
      try {
        console.log(`${L} GET ${url}`)
        const res = await fetch(url, { headers: this.headers() })
        console.log(`${L}   → HTTP ${res.status}`)
        if (!res.ok) continue
        const data = await res.json()
        // Multiple response shapes across API versions
        const profile = data.data || data.profile || data
        // Normalize field names (web API uses different casing)
        const name = profile.fullName || profile.name || profile.firstName
        const email = profile.emailId || profile.email
        const userId = profile.userId || profile.id || this.userId
        if (name || email || userId) {
          console.log(`${L} ✓ got profile: name=${name ?? 'null'} email=${email ?? 'null'}`)
          return {
            userId: String(userId || ''),
            name: name || null,
            email: email || null,
            mobile: profile.mobile || profile.mobileNumber || null,
            profileHeadline: profile.resumeHeadline || profile.headline || profile.profileTitle || null,
            experience: profile.totalExperience?.year ?? profile.experience ?? null,
            skills: profile.keySkills?.map((k: { skill?: string; value?: string } | string) =>
              typeof k === 'string' ? k : k.skill || k.value || ''
            ).filter(Boolean) || [],
            currentLocation: profile.currentCity || profile.location || null,
          }
        }
      } catch (err) {
        console.log(`${L}   → threw: ${err}`)
        continue
      }
    }
    console.log(`${L} ✗ all endpoints failed`)
    return null
  }

  /**
   * GET CV ID (uniqueId) — required for apply flow
   * From: resman-aggregator-services/v0/uniqueId
   */
  async getCvId(): Promise<string | null> {
    const L = '[NaukriClient.getCvId]'
    const endpoints = [
      `${NAUKRI_BASE}${PATHS.UNIQUE_ID}`,
      `${NMA_BASE}${PATHS.UNIQUE_ID}`,
    ]
    for (const url of endpoints) {
      try {
        console.log(`${L} GET ${url}`)
        const res = await fetch(url, { headers: this.headers() })
        console.log(`${L}   → HTTP ${res.status}`)
        if (!res.ok) {
          const txt = await res.text()
          console.log(`${L}   → body: ${txt.slice(0, 200)}`)
          continue
        }
        const data = await res.json()
        console.log(`${L}   → data keys: ${Object.keys(data).join(', ')}`)
        const id = data.uniqueId || data.cvId || data.data?.uniqueId || data.data?.cvId
        if (id) {
          console.log(`${L} ✓ cvId: ${id}`)
          return String(id)
        }
      } catch (err) {
        console.log(`${L}   → threw: ${err}`)
        continue
      }
    }
    console.log(`${L} ✗ cvId not found — apply will fail`)
    return null
  }

  /**
   * SEARCH IMPRESSIONS — "Times your profile appeared in recruiter searches"
   */
  async getSearchImpressions(): Promise<number> {
    try {
      const res = await fetch(`${NAUKRI_BASE}${PATHS.SEARCH_IMPRESSIONS}`, {
        headers: this.headers(),
      })
      if (!res.ok) return 0
      const data = await res.json()
      return data.count || data.searchImpressions || data.data?.count || 0
    } catch {
      return 0
    }
  }

  /**
   * RECRUITER VIEWS — who viewed your profile
   * From: RecruiterActionService.getRecruiterActions() in DEX
   */
  async getRecruiterViews(page = 1): Promise<{ views: unknown[]; total: number }> {
    try {
      const res = await fetch(
        `${NAUKRI_BASE}${PATHS.RECRUITER_ACTIONS}?page=${page}&limit=20`,
        { headers: this.headers() }
      )
      if (!res.ok) return { views: [], total: 0 }
      const data = await res.json()
      const views = data.recruiterActions || data.data || data.actions || []
      return { views, total: data.total || views.length }
    } catch {
      return { views: [], total: 0 }
    }
  }

  /**
   * JOB SEARCH — Naukri web SRP API
   * Uses srp_sdui.json patterns we reverse engineered:
   * - keyword, location, experience from SDUI vars
   * - salary, jobType, wfhType from feature flags
   */
  async searchJobs(params: {
    keyword: string
    location?: string
    experience?: number
    salaryMin?: number
    noOfResults?: number
    page?: number
    wfhMode?: boolean
  }): Promise<JobSearchResult> {
    const qp = new URLSearchParams({
      noOfResults: String(params.noOfResults || 20),
      urlType: 'search_by_keyword',
      searchType: 'adv',
      keyword: params.keyword,
      location: params.location || '',
      experience: String(params.experience ?? 0),
      salary: String(params.salaryMin || 0),
      pPage: String(params.page || 1),
    })

    if (params.wfhMode) qp.set('wfhType', '2') // Work from home filter

    try {
      const res = await fetch(`${NAUKRI_BASE}${PATHS.JOB_SEARCH}?${qp.toString()}`, {
        headers: {
          ...this.headers(),
          'Referer': 'https://www.naukri.com',
        },
      })
      if (!res.ok) return { jobDetails: [], noOfJobs: 0 }
      const data = await res.json()
      return {
        jobDetails: data.jobDetails || data.jobs || [],
        noOfJobs: data.noOfJobs || data.total || 0,
        urlWord: data.urlWord,
      }
    } catch {
      return { jobDetails: [], noOfJobs: 0 }
    }
  }

  /**
   * GET JOB DESCRIPTION — full JD for a specific job
   * Uses jd_sdui_sample.json patterns from SDUI RE
   */
  async getJobDescription(jobId: string): Promise<string | null> {
    try {
      const res = await fetch(
        `${NAUKRI_BASE}/jobapi/v2/job/${jobId}`,
        { headers: this.headers() }
      )
      if (!res.ok) return null
      const data = await res.json()
      return data.jobDescription || data.description || data.data?.jobDescription || null
    } catch {
      return null
    }
  }

  /**
   * APPLY TO JOB — from postApplyBottomSheet + SDUIApplyRenderActivity RE
   * Also handles autoApplyViaCallBottomSheet pattern
   */
  async applyToJob(jobId: string, cvId: string, coverNote?: string): Promise<ApplyResult> {
    try {
      const body: Record<string, unknown> = {
        jobId,
        cvId,
        source: 'NAUKRI_ANDROID',
        applySource: 'DIRECT_APPLY',
      }
      if (coverNote) body.coverNote = coverNote

      const res = await fetch(
        `${NMA_BASE}${PATHS.JOB_APPLY}/${jobId}/apply`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(body),
        }
      )

      const data = await res.json()

      if (res.status === 409 || data.alreadyApplied) {
        return { success: false, alreadyApplied: true }
      }

      if (!res.ok) {
        return { success: false, error: data.message || `HTTP ${res.status}` }
      }

      return {
        success: true,
        applicationId: data.applicationId || data.id || data.data?.applicationId,
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Apply failed' }
    }
  }

  /**
   * CHECK IF TOKEN IS STILL VALID
   */
  async isTokenValid(): Promise<boolean> {
    try {
      const res = await fetch(`${NMA_BASE}${PATHS.ACTIVITY_LEVEL}`, {
        headers: this.headers(),
      })
      return res.status !== 401 && res.status !== 403
    } catch {
      return false
    }
  }
}
