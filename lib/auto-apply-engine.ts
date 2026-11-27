/**
 * Auto-Apply Engine — the core loop
 *
 * Flow:
 * 1. Search jobs by user preferences
 * 2. Score each job against their resume (AI)
 * 3. Queue high-score matches
 * 4. Tailor resume per job (AI)
 * 5. Apply via Naukri API
 * 6. Log results
 */

import { NaukriClient, NaukriJob } from './naukri-client'
import { scoreMatch, tailorResume } from './resume-ai'
import { supabaseAdmin, User } from './supabase'
import { decrypt } from './encryption'

const RATE_LIMIT_MS = 3000     // 3 seconds between applies (be respectful)
const MAX_JOBS_PER_RUN = 50    // max jobs to fetch per search
const MAX_APPLIES_PER_RUN = 10 // max applies per engine run

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export type EngineResult = {
  userId: string
  jobsSearched: number
  jobsScored: number
  jobsQueued: number
  jobsApplied: number
  jobsSkipped: number
  jobsFailed: number
  errors: string[]
  duration: number
}

export async function runAutoApplyEngine(userId: string): Promise<EngineResult> {
  const startTime = Date.now()
  const result: EngineResult = {
    userId,
    jobsSearched: 0,
    jobsScored: 0,
    jobsQueued: 0,
    jobsApplied: 0,
    jobsSkipped: 0,
    jobsFailed: 0,
    errors: [],
    duration: 0,
  }

  // 1. Load user
  const { data: user, error: userErr } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (userErr || !user) {
    result.errors.push('User not found')
    result.duration = Date.now() - startTime
    return result
  }

  if (!user.naukri_token || !user.naukri_user_id) {
    result.errors.push('Naukri not connected')
    result.duration = Date.now() - startTime
    return result
  }

  if (!user.base_resume_text) {
    result.errors.push('No resume uploaded')
    result.duration = Date.now() - startTime
    return result
  }

  if (!user.auto_apply_enabled) {
    result.errors.push('Auto-apply disabled')
    result.duration = Date.now() - startTime
    return result
  }

  // Log sync start
  const { data: syncLog } = await supabaseAdmin.from('sync_logs').insert({
    user_id: userId,
    sync_type: 'auto_apply_full',
    status: 'running',
  }).select().single()

  // 2. Decrypt Naukri token and init client
  let token: string
  try {
    token = decrypt(user.naukri_token)
  } catch {
    result.errors.push('Failed to decrypt Naukri token')
    result.duration = Date.now() - startTime
    return result
  }

  const client = new NaukriClient(token, user.naukri_user_id)

  // 3. Validate token
  const tokenValid = await client.isTokenValid()
  if (!tokenValid) {
    // Try to re-login if credentials stored
    if (user.naukri_email && user.naukri_password_enc) {
      try {
        const password = decrypt(user.naukri_password_enc)
        const loginResult = await NaukriClient.login(user.naukri_email, password)
        if (loginResult.success && loginResult.token) {
          // Update token in DB
          const { encrypt } = await import('./encryption')
          await supabaseAdmin.from('users').update({
            naukri_token: encrypt(loginResult.token),
            naukri_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          }).eq('id', userId)
          // Reinit client
          const freshClient = new NaukriClient(loginResult.token, user.naukri_user_id)
          return await _runApplyLoop(freshClient, user, result, syncLog?.id, startTime)
        }
      } catch {
        result.errors.push('Token expired, re-login failed')
      }
    } else {
      result.errors.push('Naukri session expired — please reconnect')
    }
    if (syncLog) {
      await supabaseAdmin.from('sync_logs').update({ status: 'error', error_message: result.errors.join(', '), ended_at: new Date().toISOString() }).eq('id', syncLog.id)
    }
    result.duration = Date.now() - startTime
    return result
  }

  return await _runApplyLoop(client, user, result, syncLog?.id, startTime)
}

async function _runApplyLoop(
  client: NaukriClient,
  user: User,
  result: EngineResult,
  syncLogId: string | undefined,
  startTime: number
): Promise<EngineResult> {
  const prefs = user.preferences
  const minScore = user.min_match_score || 65
  const maxApplies = Math.min(user.auto_apply_limit_per_day || 10, MAX_APPLIES_PER_RUN)

  // Check today's apply count
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const { count: todayApplies } = await supabaseAdmin
    .from('apply_history')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('applied_at', today.toISOString())

  const remainingQuota = maxApplies - (todayApplies || 0)
  if (remainingQuota <= 0) {
    result.errors.push(`Daily apply limit (${maxApplies}) reached`)
    result.duration = Date.now() - startTime
    return result
  }

  // 4. Search jobs
  const keywords = [
    prefs.targetRole,
    ...(prefs.skills || []).slice(0, 2),
  ].filter(Boolean).join(' ')

  const locations = prefs.locations || []
  const searchLocations = locations.length > 0 ? locations : ['']

  const allJobs: NaukriJob[] = []
  for (const location of searchLocations.slice(0, 3)) {
    const searchResult = await client.searchJobs({
      keyword: keywords,
      location,
      experience: prefs.experience || 0,
      salaryMin: prefs.minSalary || 0,
      noOfResults: Math.ceil(MAX_JOBS_PER_RUN / searchLocations.length),
      wfhMode: prefs.wfhPreference === 'full-wfh',
    })
    allJobs.push(...searchResult.jobDetails)
    result.jobsSearched += searchResult.jobDetails.length
  }

  // Deduplicate by jobId
  const uniqueJobs = Array.from(
    new Map(allJobs.map(j => [j.jobId, j])).values()
  )

  // 5. Filter out already-applied or queued jobs
  const { data: existingJobs } = await supabaseAdmin
    .from('apply_queue')
    .select('job_id')
    .eq('user_id', user.id)
    .in('job_id', uniqueJobs.map(j => j.jobId))

  const existingIds = new Set((existingJobs || []).map(j => j.job_id))
  const newJobs = uniqueJobs.filter(j => !existingIds.has(j.jobId))

  // 6. Score + queue jobs
  let appliedCount = 0

  for (const job of newJobs) {
    if (appliedCount >= remainingQuota) break

    result.jobsScored++

    // Get full JD if not in search results
    const jdText = job.jobDescription ||
      await client.getJobDescription(job.jobId) ||
      `${job.title} at ${job.companyName}. ${job.tagsAndSkills || ''}`

    // AI match scoring
    const matchAnalysis = await scoreMatch(
      user.base_resume_text!,
      job.title,
      jdText,
      prefs.experience || 0
    )

    // Insert into queue regardless (so we don't re-score)
    const queueEntry = {
      user_id: user.id,
      job_id: job.jobId,
      job_title: job.title,
      company_name: job.companyName,
      location: job.location || (job.placeholders?.[0]?.label),
      jd_text: jdText.slice(0, 10000),
      job_url: job.jdURL || job.staticUrl,
      match_score: matchAnalysis.score,
      is_wfh: prefs.wfhPreference === 'full-wfh',
      status: matchAnalysis.recommend && matchAnalysis.score >= minScore
        ? 'tailoring'
        : 'skipped',
      skip_reason: !matchAnalysis.recommend
        ? `Score ${matchAnalysis.score}/100 — ${matchAnalysis.reasoning}`
        : undefined,
      ai_analysis: matchAnalysis.reasoning,
    }

    await supabaseAdmin.from('apply_queue').insert(queueEntry)

    if (!matchAnalysis.recommend || matchAnalysis.score < minScore) {
      result.jobsSkipped++
      continue
    }

    result.jobsQueued++

    // 7. Tailor resume
    let tailored
    try {
      tailored = await tailorResume({
        baseResume: user.base_resume_text!,
        jobTitle: job.title,
        companyName: job.companyName,
        jobDescription: jdText,
        candidateSkills: prefs.skills,
      })

      await supabaseAdmin.from('apply_queue')
        .update({ tailored_resume: tailored, status: 'applying' })
        .eq('user_id', user.id)
        .eq('job_id', job.jobId)
    } catch (err) {
      result.errors.push(`Tailor failed for ${job.jobId}: ${err}`)
      await supabaseAdmin.from('apply_queue')
        .update({ status: 'failed', apply_error: 'Resume tailoring failed' })
        .eq('user_id', user.id)
        .eq('job_id', job.jobId)
      result.jobsFailed++
      continue
    }

    // 8. Apply!
    await sleep(RATE_LIMIT_MS)

    const applyResult = await client.applyToJob(
      job.jobId,
      user.naukri_cv_id!,
      tailored.coverNote
    )

    if (applyResult.alreadyApplied) {
      await supabaseAdmin.from('apply_queue')
        .update({ status: 'skipped', skip_reason: 'Already applied' })
        .eq('user_id', user.id)
        .eq('job_id', job.jobId)
      result.jobsSkipped++
      continue
    }

    if (applyResult.success) {
      await supabaseAdmin.from('apply_queue')
        .update({
          status: 'done',
          applied_at: new Date().toISOString(),
          apply_response: applyResult,
        })
        .eq('user_id', user.id)
        .eq('job_id', job.jobId)

      // Add to history
      await supabaseAdmin.from('apply_history').insert({
        user_id: user.id,
        job_id: job.jobId,
        job_title: job.title,
        company_name: job.companyName,
        match_score: matchAnalysis.score,
        status: 'applied',
        response: applyResult,
      })

      result.jobsApplied++
      appliedCount++
    } else {
      await supabaseAdmin.from('apply_queue')
        .update({
          status: 'failed',
          apply_error: applyResult.error,
        })
        .eq('user_id', user.id)
        .eq('job_id', job.jobId)
      result.jobsFailed++
      result.errors.push(`Apply failed for ${job.title}: ${applyResult.error}`)
    }
  }

  // Update sync log
  if (syncLogId) {
    await supabaseAdmin.from('sync_logs').update({
      status: 'done',
      jobs_found: result.jobsSearched,
      jobs_applied: result.jobsApplied,
      jobs_skipped: result.jobsSkipped,
      ended_at: new Date().toISOString(),
    }).eq('id', syncLogId)
  }

  result.duration = Date.now() - startTime
  return result
}
