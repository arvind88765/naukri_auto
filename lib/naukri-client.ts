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
   * LOGIN — tries Naukri web API (confirmed working), falls back to NMA mobile gateway
   */
  static async login(email: string, password: string): Promise<LoginResult> {
    // ── Attempt 1: Naukri web login (naukri.com/central-login-services) ──
    try {
      const res = await fetch(`${NAUKRI_BASE}/central-login-services/v0/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'appid': '105',
          'clientid': 'd3skt0p',
          'systemid': '103',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Origin': 'https://www.naukri.com',
          'Referer': 'https://www.naukri.com/nlogin/login',
        },
        body: JSON.stringify({
          username: email,
          password: password,
          loginType: 'emailLogin',
        }),
      })

      const text = await res.text()
      console.log('[NaukriClient.login] web attempt status:', res.status, 'body preview:', text.slice(0, 200))

      if (text && text.trim().startsWith('{')) {
        const data = JSON.parse(text)
        const token = data.authToken || data.token || data.access_token || data.data?.authToken
        const userId = data.userId || data.user_id || data.id || data.data?.userId || data.data?.id

        if (res.ok && token && userId) {
          return { success: true, token, userId: String(userId) }
        }

        if (!res.ok) {
          // Don't return yet — try fallback
          console.log('[NaukriClient.login] web attempt failed:', data.message || data.error)
        }
      }
    } catch (err) {
      console.log('[NaukriClient.login] web attempt threw:', err)
    }

    // ── Attempt 2: NMA mobile gateway (APK port-login) ──
    try {
      const res = await fetch(`${NMA_BASE}${PATHS.LOGIN}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'appid': 'applicationservice',
          'systemid': 'Naukri',
          'User-Agent': 'NaukriApp/22.3 (Android; arm64-v8a)',
        },
        body: JSON.stringify({
          username: email,
          password: password,
          loginType: 'emailLogin',
        }),
      })

      const text = await res.text()
      console.log('[NaukriClient.login] NMA attempt status:', res.status, 'body preview:', text.slice(0, 200))

      if (text && text.trim().startsWith('{')) {
        const data = JSON.parse(text)

        if (res.ok && (data.token || data.authToken || data.access_token)) {
          const token = data.token || data.authToken || data.access_token
          const userId = data.userId || data.user_id || data.id || data.sub
          return { success: true, token, userId: String(userId) }
        }

        if (data.data?.token) {
          return { success: true, token: data.data.token, userId: String(data.data.userId || data.data.id) }
        }

        return {
          success: false,
          error: data.message || data.error || `Login failed (HTTP ${res.status})`,
          statusCode: res.status,
        }
      }

      return { success: false, error: `Non-JSON response from Naukri (HTTP ${res.status})`, statusCode: res.status }
    } catch (err) {
      return {
        success: false,
        error: `Network error: ${err instanceof Error ? err.message : 'Unknown'}`,
      }
    }
  }

  /**
   * GET FULL PROFILE — resman-aggregator-services
   */
  async getProfile(): Promise<NaukriProfile | null> {
    try {
      const res = await fetch(`${NMA_BASE}${PATHS.USERS_SELF}`, {
        headers: this.headers(),
      })
      if (!res.ok) return null
      const data = await res.json()
      // normalize various response shapes
      return data.data || data.profile || data
    } catch {
      return null
    }
  }

  /**
   * GET CV ID (uniqueId) — required for apply flow
   * From: resman-aggregator-services/v0/uniqueId
   */
  async getCvId(): Promise<string | null> {
    try {
      const res = await fetch(`${NMA_BASE}${PATHS.UNIQUE_ID}`, {
        headers: this.headers(),
      })
      if (!res.ok) return null
      const data = await res.json()
      return data.uniqueId || data.cvId || data.data?.uniqueId || null
    } catch {
      return null
    }
  }

  /**
   * SEARCH IMPRESSIONS — "Times your profile appeared in recruiter searches"
   */
  async getSearchImpressions(): Promise<number> {
    try {
      const res = await fetch(`${NMA_BASE}${PATHS.SEARCH_IMPRESSIONS}`, {
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
        `${NMA_BASE}${PATHS.RECRUITER_ACTIONS}?page=${page}&limit=20`,
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
