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
   * Build auth headers discovered from AuthInterceptor.kt in DEX
   */
  private headers(extra?: Record<string, string>): HeadersInit {
    return {
      'Authorization': `Bearer ${this.token}`,
      'X-Naukri-User-Id': this.userId,
      'Content-Type': 'application/json',
      'appid': 'applicationservice',
      'systemid': 'Naukri',
      'User-Agent': 'NaukriApp/22.3 (Android; arm64-v8a)',
      'Accept': 'application/json',
      ...extra,
    }
  }

  /**
   * LOGIN — tries multiple Naukri endpoints in sequence
   */
  static async login(email: string, password: string): Promise<LoginResult> {
    const L = '[NaukriClient.login]'

    // Helper: try one endpoint and return parsed result
    const tryEndpoint = async (
      label: string,
      url: string,
      headers: Record<string, string>,
      body: Record<string, unknown>,
    ): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null; raw: string }> => {
      console.log(`${L} ── ${label} ──`)
      console.log(`${L}   POST ${url}`)
      const bodyStr = JSON.stringify(body)
      console.log(`${L}   → sending body: ${bodyStr}`)
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: bodyStr,
        })
        const raw = await res.text()
        console.log(`${L}   → HTTP ${res.status}`)
        console.log(`${L}   → response body: ${raw.slice(0, 600)}`)
        const isJson = raw.trim().startsWith('{') || raw.trim().startsWith('[')
        const data = isJson ? JSON.parse(raw) : null
        if (data) console.log(`${L}   → keys: ${Object.keys(data).join(', ')}`)
        return { ok: res.ok, status: res.status, data, raw }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`${L}   → threw: ${msg}`)
        return { ok: false, status: 0, data: null, raw: msg }
      }
    }

    // Helper: extract token + userId from various response shapes
    const extract = (data: Record<string, unknown>) => {
      const d = (data?.data ?? {}) as Record<string, unknown>
      const token =
        (data.authToken as string) || (data.token as string) || (data.access_token as string) ||
        (d.authToken as string) || (d.token as string)
      const userId =
        (data.userId as string) || (data.user_id as string) || (data.id as string) ||
        (d.userId as string) || (d.id as string) || (data.sub as string)
      return { token: token || null, userId: userId ? String(userId) : null }
    }

    // ── Naukri requires specific headers from their web app ──
    // Captured from HAR analysis of naukri.com login flow (Chrome DevTools)
    // appid=105 = web client, clientid=d3skt0p = desktop, systemid=103 = web
    // gzip header required — Naukri API returns 400 without Accept-Encoding
    const WEB_HEADERS = {
      'appid': '105',
      'clientid': 'd3skt0p',
      'systemid': '103',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Content-Type': 'application/json',
      'Origin': 'https://www.naukri.com',
      'Referer': 'https://www.naukri.com/nlogin/login',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Connection': 'keep-alive',
    }

    // ── Attempt 1: standard v2 login (most common endpoint used by web) ──
    {
      const r = await tryEndpoint(
        'Attempt 1: v2 login (web standard)',
        `${NAUKRI_BASE}/central-login-services/v2/login`,
        WEB_HEADERS,
        { loginDetails: { username: email, password }, loginType: 'emailLogin' },
      )
      if (r.data) {
        const { token, userId } = extract(r.data)
        console.log(`${L}   → token: ${token?.slice(0, 20) ?? 'null'} | userId: ${userId ?? 'null'}`)
        if (r.ok && token && userId) {
          console.log(`${L} ✓ SUCCESS via attempt 1 (v2)`)
          return { success: true, token, userId }
        }
        const errData = r.data as Record<string, unknown>
        const errMsg = (errData.message as string) || `HTTP ${r.status}`
        console.log(`${L}   → attempt 1 failed: ${errMsg} | validationErrors: ${JSON.stringify(errData.validationErrors)}`)
      }
    }

    // ── Attempt 2: v0 login with nested loginDetails ──
    {
      const r = await tryEndpoint(
        'Attempt 2: v0 login nested body',
        `${NAUKRI_BASE}/central-login-services/v0/login`,
        WEB_HEADERS,
        { loginDetails: { username: email, password }, loginType: 'emailLogin' },
      )
      if (r.data) {
        const { token, userId } = extract(r.data)
        console.log(`${L}   → token: ${token?.slice(0, 20) ?? 'null'} | userId: ${userId ?? 'null'}`)
        if (r.ok && token && userId) {
          console.log(`${L} ✓ SUCCESS via attempt 2 (v0 nested)`)
          return { success: true, token, userId }
        }
        const errData = r.data as Record<string, unknown>
        console.log(`${L}   → attempt 2 failed: ${(errData.message as string) || `HTTP ${r.status}`}`)
      }
    }

    // ── Attempt 3: flat body format (some versions) ──
    {
      const r = await tryEndpoint(
        'Attempt 3: flat body username+password',
        `${NAUKRI_BASE}/central-login-services/v0/login`,
        WEB_HEADERS,
        { username: email, password, loginType: 'emailLogin' },
      )
      if (r.data) {
        const { token, userId } = extract(r.data)
        console.log(`${L}   → token: ${token?.slice(0, 20) ?? 'null'} | userId: ${userId ?? 'null'}`)
        if (r.ok && token && userId) {
          console.log(`${L} ✓ SUCCESS via attempt 3 (flat body)`)
          return { success: true, token, userId }
        }
        const errData = r.data as Record<string, unknown>
        const errMsg = (errData.message as string) || `HTTP ${r.status}`
        console.log(`${L}   → attempt 3 failed: ${errMsg}`)
        // If we got a real Naukri error message (like "Invalid credentials"), bubble it up
        if (r.status === 401 || r.status === 403 || errMsg.toLowerCase().includes('invalid') || errMsg.toLowerCase().includes('wrong')) {
          return { success: false, error: errMsg, statusCode: r.status }
        }
      }
    }

    // ── Attempt 4: v1 login ──
    {
      const r = await tryEndpoint(
        'Attempt 4: v1 login endpoint',
        `${NAUKRI_BASE}/central-login-services/v1/login`,
        WEB_HEADERS,
        { loginDetails: { username: email, password }, loginType: 'emailLogin' },
      )
      if (r.data) {
        const { token, userId } = extract(r.data)
        console.log(`${L}   → token: ${token?.slice(0, 20) ?? 'null'} | userId: ${userId ?? 'null'}`)
        if (r.ok && token && userId) {
          console.log(`${L} ✓ SUCCESS via attempt 4 (v1)`)
          return { success: true, token, userId }
        }
        const errData = r.data as Record<string, unknown>
        const errMsg = (errData.message as string) || `HTTP ${r.status}`
        console.log(`${L}   → attempt 4 failed: ${errMsg}`)
        return { success: false, error: errMsg, statusCode: r.status }
      }
      return { success: false, error: `Non-JSON from Naukri (HTTP ${r.status})`, statusCode: r.status }
    }
  }

  /**
   * GET FULL PROFILE — resman-aggregator-services
   */
  async getProfile(): Promise<NaukriProfile | null> {
    // Try multiple profile endpoints — NMA base is dead, use naukri.com
    const endpoints = [
      `${NAUKRI_BASE}${PATHS.USERS_SELF}`,
      `${NAUKRI_BASE}${PATHS.USERS_SELF_V1}`,
      `${NMA_BASE}${PATHS.USERS_SELF}`,
    ]
    for (const url of endpoints) {
      try {
        const res = await fetch(url, { headers: this.headers() })
        if (!res.ok) continue
        const data = await res.json()
        const profile = data.data || data.profile || data
        if (profile && (profile.userId || profile.name || profile.email)) {
          return profile
        }
      } catch {
        continue
      }
    }
    return null
  }

  /**
   * GET CV ID (uniqueId) — required for apply flow
   * From: resman-aggregator-services/v0/uniqueId
   */
  async getCvId(): Promise<string | null> {
    const endpoints = [
      `${NAUKRI_BASE}${PATHS.UNIQUE_ID}`,
      `${NMA_BASE}${PATHS.UNIQUE_ID}`,
    ]
    for (const url of endpoints) {
      try {
        const res = await fetch(url, { headers: this.headers() })
        if (!res.ok) continue
        const data = await res.json()
        const id = data.uniqueId || data.cvId || data.data?.uniqueId
        if (id) return String(id)
      } catch {
        continue
      }
    }
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
