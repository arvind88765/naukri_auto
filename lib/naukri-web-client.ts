/**
 * NaukriWebClient — Cookie-based Naukri client
 *
 * From HAR analysis (naukri.com logged-in session):
 * - Base: https://www.naukri.com
 * - Auth: Cookie-based (nauk_at, nkid, _t, nauk_sid)
 * - Key headers: appid=105, clientid=d3skt0p, systemid=103
 * - Profile API: cloudgateway-mynaukri/resman-aggregator-services
 * - Apply: cloudgateway-apply/job-apply-services
 *
 * User copies cookies from Chrome DevTools > Application > Cookies
 */

const BASE = 'https://www.naukri.com'

export type WebConnectResult = {
  success: boolean
  profile?: WebProfile
  error?: string
}

export type WebProfile = {
  name: string
  email: string
  profileId: string
  mobile?: string
  keySkills?: string
  resumeHeadline?: string
  experience?: { year: string; month: string }
  locations?: { id: number; value: string }[]
  cvInfo?: {
    cvFormat: string
    uploadDate: string
    fileName: string
    isAvailable: boolean
  }
  noticePeriod?: { id: number; value: string }
  industry?: { id: number; value: string }
}

export type WebJobSearchResult = {
  jobDetails: WebJob[]
  noOfJobs: number
}

export type WebJob = {
  jobId: string
  title: string
  companyName: string
  location?: string
  salary?: string
  experience?: string
  jdURL?: string
  tagsAndSkills?: string
  jobDescription?: string
  isEasyApply?: boolean
  applyRedirectUrl?: string
  staticUrl?: string
  workMode?: string
}

export type WebApplyResult = {
  success: boolean
  applicationId?: string
  error?: string
  alreadyApplied?: boolean
}

export class NaukriWebClient {
  private cookieStr: string

  constructor(cookieStr: string) {
    this.cookieStr = cookieStr
  }

  /**
   * Common headers discovered from HAR analysis of logged-in naukri.com
   * appid=105 = dashboard/mynaukri area
   * clientid=d3skt0p = desktop web client
   * systemid=103 = Naukri system identifier
   */
  private headers(extra?: Record<string, string>): HeadersInit {
    return {
      'Cookie': this.cookieStr,
      'appid': '105',
      'clientid': 'd3skt0p',
      'systemid': '103',
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-IN,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      'Referer': 'https://www.naukri.com/',
      'Origin': 'https://www.naukri.com',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
      ...extra,
    }
  }

  /**
   * Verify cookies are valid by calling dashboard API
   * From HAR: /cloudgateway-mynaukri/resman-aggregator-services/v1/users/self/dashboard
   */
  async verifyAndGetProfile(): Promise<WebConnectResult> {
    try {
      const res = await fetch(
        `${BASE}/cloudgateway-mynaukri/resman-aggregator-services/v2/users/self?expand_level=3&properties=profile`,
        { headers: this.headers() }
      )

      if (res.status === 401 || res.status === 403) {
        return { success: false, error: 'Cookies expired or invalid. Please copy fresh cookies from your browser.' }
      }

      if (!res.ok) {
        return { success: false, error: `Naukri API returned ${res.status}. Try again.` }
      }

      const data = await res.json()
      const profile = data.profile?.[0] || data.profile || data

      if (!profile?.profileId) {
        return { success: false, error: 'Could not read profile. Make sure you are logged into naukri.com and copied the right cookies.' }
      }

      // Also fetch email from dashboard
      let email = ''
      try {
        const dashRes = await fetch(
          `${BASE}/cloudgateway-mynaukri/resman-aggregator-services/v1/users/self/dashboard`,
          { headers: this.headers() }
        )
        if (dashRes.ok) {
          const dash = await dashRes.json()
          email = dash.dashBoard?.username || ''
        }
      } catch { /* ignore */ }

      return {
        success: true,
        profile: {
          name: profile.name || 'User',
          email: email,
          profileId: profile.profileId,
          mobile: profile.mvn,
          keySkills: profile.keySkills,
          resumeHeadline: profile.resumeHeadline,
          experience: profile.experience,
          locations: profile.newLocationPrefId || profile.locationPrefId,
          cvInfo: profile.cvInfo,
          noticePeriod: profile.noticePeriod,
          industry: profile.entityIndustry || profile.industry,
        },
      }
    } catch (err) {
      return {
        success: false,
        error: `Connection error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }
    }
  }

  /**
   * Search jobs via Naukri web API
   * From HAR: /jobapi/v2/list (same as mobile but with cookie auth)
   */
  async searchJobs(params: {
    keyword: string
    location?: string
    experience?: number
    salaryMin?: number
    noOfResults?: number
    page?: number
    wfhMode?: boolean
  }): Promise<WebJobSearchResult> {
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

    if (params.wfhMode) qp.set('wfhType', '2')

    try {
      const res = await fetch(
        `${BASE}/jobapi/v2/list?${qp.toString()}`,
        { headers: this.headers({ 'appid': '109' }) }  // appid 109 = job search
      )
      if (!res.ok) return { jobDetails: [], noOfJobs: 0 }
      const data = await res.json()
      return {
        jobDetails: data.jobDetails || data.jobs || [],
        noOfJobs: data.noOfJobs || data.total || 0,
      }
    } catch {
      return { jobDetails: [], noOfJobs: 0 }
    }
  }

  /**
   * Get full job description
   */
  async getJobDescription(jobId: string): Promise<string | null> {
    try {
      const res = await fetch(
        `${BASE}/jobapi/v2/job/${jobId}`,
        { headers: this.headers({ 'appid': '109' }) }
      )
      if (!res.ok) return null
      const data = await res.json()
      return data.jobDescription || data.description || data.data?.jobDescription || null
    } catch {
      return null
    }
  }

  /**
   * Apply to a job via web API
   * From HAR: cloudgateway-apply endpoint with cookie auth
   */
  async applyToJob(jobId: string, profileId: string, coverNote?: string): Promise<WebApplyResult> {
    try {
      const body: Record<string, unknown> = {
        jobId,
        profileId,
        source: 'NAUKRI_WEB_DESKTOP',
        applySource: 'DIRECT_APPLY',
      }
      if (coverNote) body.coverNote = coverNote

      const res = await fetch(
        `${BASE}/cloudgateway-apply/job-apply-services/v0/jobs/${jobId}/apply`,
        {
          method: 'POST',
          headers: this.headers({ 'appid': '105' }),
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
   * Check if cookies are still valid
   */
  async isValid(): Promise<boolean> {
    try {
      const res = await fetch(
        `${BASE}/cloudgateway-mynaukri/resman-aggregator-services/v1/users/self/dashboard`,
        { headers: this.headers() }
      )
      return res.status !== 401 && res.status !== 403
    } catch {
      return false
    }
  }
}
