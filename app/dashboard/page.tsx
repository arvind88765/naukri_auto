'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Navbar from '@/components/Navbar'
import JobCard from '@/components/JobCard'

interface ProfileData {
  user: {
    name: string
    email: string
    naukri_email: string
    preferences: {
      targetRole?: string
      experience?: number
      locations?: string[]
      minSalary?: number
      wfhPreference?: string
      skills?: string[]
      minScore?: number
    }
    resume_text: string | null
    auto_apply_enabled: boolean
    daily_apply_limit: number
  }
  naukri?: {
    name?: string
    headline?: string
    totalExperience?: number
    skills?: string[]
  }
  stats: {
    totalApplied: number
    totalQueued: number
    todayApplied: number
  }
}

interface QueueData {
  queue: Array<{
    id: string
    job_id: string
    job_title: string
    company_name: string
    location?: string
    match_score?: number
    status: string
    applied_at?: string
    created_at: string
    error_message?: string
    tailored_resume?: { matchedKeywords?: string[] }
  }>
  history: Array<{
    id: string
    job_id: string
    job_title: string
    company_name: string
    location?: string
    match_score?: number
    status: string
    applied_at?: string
    created_at: string
  }>
  statusBreakdown: Record<string, number>
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [queue, setQueue] = useState<QueueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [triggerResult, setTriggerResult] = useState<string | null>(null)
  const [autoApply, setAutoApply] = useState(false)
  const [togglingAuto, setTogglingAuto] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [profileRes, queueRes] = await Promise.all([
        fetch('/api/naukri/profile'),
        fetch('/api/naukri/jobs/apply'),
      ])
      if (profileRes.ok) {
        const p = await profileRes.json()
        setProfile(p)
        setAutoApply(p.user?.auto_apply_enabled ?? false)
      }
      if (queueRes.ok) setQueue(await queueRes.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
    if (status === 'authenticated') {
      const user = session?.user as { onboardingCompleted?: boolean; naukriConnected?: boolean } | undefined
      if (!user?.naukriConnected || !user?.onboardingCompleted) router.push('/onboard')
      else fetchData()
    }
  }, [status, session, router, fetchData])

  // Auto-refresh if jobs are being processed
  useEffect(() => {
    const hasActive = queue?.queue?.some(j => ['scoring', 'tailoring', 'applying'].includes(j.status))
    if (!hasActive) return
    const t = setInterval(fetchData, 4000)
    return () => clearInterval(t)
  }, [queue, fetchData])

  const handleTriggerApply = async () => {
    setTriggering(true)
    setTriggerResult(null)
    try {
      const res = await fetch('/api/naukri/jobs/apply', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setTriggerResult(`⚠ ${data.error}`)
      } else {
        setTriggerResult(`✓ Engine started — found ${data.result?.jobsFound ?? 0} jobs, applied to ${data.result?.applied ?? 0}`)
        setTimeout(fetchData, 3000)
      }
    } finally {
      setTriggering(false)
    }
  }

  const handleToggleAutoApply = async () => {
    setTogglingAuto(true)
    const newVal = !autoApply
    try {
      await fetch('/api/naukri/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoApplyEnabled: newVal }),
      })
      setAutoApply(newVal)
    } finally {
      setTogglingAuto(false)
    }
  }

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  }

  const p = profile
  const user = p?.user
  const stats = p?.stats ?? { totalApplied: 0, totalQueued: 0, todayApplied: 0 }
  const sb = queue?.statusBreakdown ?? {}
  const recentJobs = [...(queue?.queue ?? []), ...(queue?.history ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 5)

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>
              Hey {user?.name?.split(' ')[0] ?? 'chief'} 👋
            </h1>
            <p style={{ color: '#9090aa', fontSize: 15 }}>
              {user?.preferences?.targetRole ? `Hunting for ${user.preferences.targetRole} roles` : 'Your job hunt dashboard'}
            </p>
          </div>

          {/* Auto-apply toggle */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Auto-Apply</div>
              <div style={{ fontSize: 12, color: '#6060a0' }}>Runs every hour</div>
            </div>
            <button
              onClick={handleToggleAutoApply}
              disabled={togglingAuto}
              style={{
                width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                background: autoApply ? '#4A90D9' : '#2a2a3a', transition: 'all 0.2s', position: 'relative',
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: autoApply ? 24 : 3,
                width: 20, height: 20, background: 'white', borderRadius: '50%',
                transition: 'left 0.2s', display: 'block',
              }} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
          {[
            { label: 'Total Applied', value: stats.totalApplied, color: '#06d6a0', icon: '✓' },
            { label: 'Today', value: `${stats.todayApplied}/${user?.daily_apply_limit ?? 50}`, color: '#4A90D9', icon: '📅' },
            { label: 'In Queue', value: stats.totalQueued, color: '#f0a500', icon: '⏳' },
            { label: 'Failed', value: sb.failed ?? 0, color: '#e74c3c', icon: '✗' },
          ].map(stat => (
            <div key={stat.label} className="stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#9090aa' }}>{stat.label}</span>
                <span style={{ fontSize: 16 }}>{stat.icon}</span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Naukri profile card */}
        {p?.naukri && (
          <div className="card" style={{ marginBottom: 24, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, background: 'rgba(74,144,217,0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
              👤
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{p.naukri.name ?? user?.name}</div>
              <div style={{ fontSize: 13, color: '#9090aa', marginTop: 2 }}>{p.naukri.headline}</div>
              {p.naukri.skills && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {p.naukri.skills.slice(0, 6).map(s => (
                    <span key={s} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(74,144,217,0.08)', color: '#4A90D9', border: '1px solid rgba(74,144,217,0.2)' }}>
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="badge-success" style={{ fontSize: 12 }}>✓ Naukri Connected</div>
            </div>
          </div>
        )}

        {/* Manual trigger */}
        <div className="card" style={{ marginBottom: 32, padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Apply Engine</h2>
              <p style={{ fontSize: 14, color: '#9090aa', margin: 0 }}>
                Finds matching jobs → scores them → tailors resume → applies automatically
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={handleTriggerApply}
              disabled={triggering}
              style={{ opacity: triggering ? 0.7 : 1 }}
            >
              {triggering ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="spinner" style={{ width: 16, height: 16 }} /> Running...
                </span>
              ) : '▶ Run Now'}
            </button>
          </div>

          {triggerResult && (
            <div style={{
              marginTop: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13,
              background: triggerResult.startsWith('⚠') ? 'rgba(231,76,60,0.08)' : 'rgba(6,214,160,0.08)',
              color: triggerResult.startsWith('⚠') ? '#e74c3c' : '#06d6a0',
              border: `1px solid ${triggerResult.startsWith('⚠') ? 'rgba(231,76,60,0.2)' : 'rgba(6,214,160,0.2)'}`,
            }}>
              {triggerResult}
            </div>
          )}

          {/* Progress bar for today */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6060a0', marginBottom: 6 }}>
              <span>Today's progress</span>
              <span>{stats.todayApplied} / {user?.daily_apply_limit ?? 50} applications</span>
            </div>
            <div style={{ height: 6, background: '#1a1a2e', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, #4A90D9, #06d6a0)',
                width: `${Math.min(100, (stats.todayApplied / (user?.daily_apply_limit ?? 50)) * 100)}%`,
                transition: 'width 0.5s',
              }} />
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Recent Activity</h2>
            <button onClick={() => router.push('/jobs')} style={{
              background: 'transparent', border: 'none', color: '#4A90D9', fontSize: 13, cursor: 'pointer', fontWeight: 600,
            }}>
              View all →
            </button>
          </div>

          {recentJobs.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: '#6060a0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#c0c0d8' }}>Engine ready to launch</div>
              <div style={{ fontSize: 14 }}>Hit "Run Now" above and we'll find and apply to jobs matching your profile</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentJobs.map(job => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </div>

        {/* Prefs summary */}
        {user?.preferences && (
          <div className="card" style={{ marginTop: 24, padding: '16px 20px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: '#c0c0d8' }}>Your Preferences</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, fontSize: 13 }}>
              {[
                { label: 'Role', val: user.preferences.targetRole },
                { label: 'Experience', val: user.preferences.experience != null ? `${user.preferences.experience} yrs` : null },
                { label: 'Locations', val: user.preferences.locations?.join(', ') },
                { label: 'Min Salary', val: user.preferences.minSalary ? `₹${user.preferences.minSalary}L` : null },
                { label: 'Work Mode', val: user.preferences.wfhPreference },
                { label: 'Min Score', val: user.preferences.minScore ? `${user.preferences.minScore}%` : null },
              ].filter(r => r.val).map(row => (
                <div key={row.label}>
                  <span style={{ color: '#6060a0' }}>{row.label}: </span>
                  <span style={{ color: '#c0c0d8', fontWeight: 500 }}>{row.val}</span>
                </div>
              ))}
            </div>
            <button onClick={() => router.push('/onboard')} style={{
              marginTop: 14, background: 'transparent', border: '1px solid #2a2a3a',
              borderRadius: 8, padding: '6px 14px', fontSize: 12, color: '#9090aa', cursor: 'pointer',
            }}>
              Edit preferences
            </button>
          </div>
        )}
      </main>
    </>
  )
}
