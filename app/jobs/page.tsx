'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Navbar from '@/components/Navbar'
import JobCard from '@/components/JobCard'

type TabType = 'all' | 'pending' | 'done' | 'failed' | 'skipped'

interface Job {
  id: string
  job_id: string
  job_title: string
  company_name: string
  location?: string
  salary_range?: string
  match_score?: number
  status: string
  applied_at?: string
  created_at: string
  error_message?: string
  tailored_resume?: { matchedKeywords?: string[]; coverNote?: string }
}

interface QueueResponse {
  queue: Job[]
  history: Job[]
  statusBreakdown: Record<string, number>
  pagination: { queueTotal: number; historyTotal: number }
}

const TAB_CONFIG: { id: TabType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'done', label: 'Applied' },
  { id: 'failed', label: 'Failed' },
  { id: 'skipped', label: 'Skipped' },
]

export default function JobsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<QueueResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabType>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const PER_PAGE = 20

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/naukri/jobs/apply')
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
    if (status === 'authenticated') fetchData()
  }, [status, router, fetchData])

  // Auto-refresh if jobs are active
  useEffect(() => {
    const hasActive = data?.queue?.some(j => ['scoring', 'tailoring', 'applying'].includes(j.status))
    if (!hasActive) return
    const t = setInterval(fetchData, 5000)
    return () => clearInterval(t)
  }, [data, fetchData])

  const allJobs: Job[] = [...(data?.queue ?? []), ...(data?.history ?? [])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const filtered = allJobs.filter(job => {
    const matchesTab = tab === 'all' || job.status === tab ||
      (tab === 'pending' && ['pending', 'scoring', 'tailoring', 'applying'].includes(job.status))
    const matchesSearch = !search ||
      job.job_title.toLowerCase().includes(search.toLowerCase()) ||
      job.company_name.toLowerCase().includes(search.toLowerCase())
    return matchesTab && matchesSearch
  })

  const paginated = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  const sb = data?.statusBreakdown ?? {}
  const totalApplied = sb.done ?? 0
  const inProgress = (sb.pending ?? 0) + (sb.scoring ?? 0) + (sb.tailoring ?? 0) + (sb.applying ?? 0)

  if (status === 'loading' || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    )
  }

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Job Queue</h1>
          <p style={{ color: '#9090aa' }}>All jobs the engine found and processed</p>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Total', val: allJobs.length, color: '#c0c0d8' },
            { label: 'Applied', val: totalApplied, color: '#06d6a0' },
            { label: 'In Progress', val: inProgress, color: '#4A90D9' },
            { label: 'Failed', val: sb.failed ?? 0, color: '#e74c3c' },
            { label: 'Skipped', val: sb.skipped ?? 0, color: '#7f8c8d' },
          ].map(item => (
            <div key={item.label} className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: item.color }}>{item.val}</div>
              <div style={{ fontSize: 12, color: '#6060a0', marginTop: 4 }}>{item.label}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {/* Search */}
          <input
            className="input"
            placeholder="Search jobs or companies..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            style={{ flex: 1, minWidth: 200 }}
          />

          {/* Refresh */}
          <button onClick={fetchData} style={{
            padding: '0 16px', borderRadius: 8, border: '1px solid #2a2a3a',
            background: 'transparent', color: '#9090aa', cursor: 'pointer', fontSize: 14,
          }}>↻</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
          {TAB_CONFIG.map(t => {
            const count = t.id === 'all' ? allJobs.length
              : t.id === 'pending' ? inProgress
              : (sb[t.id] ?? 0)
            return (
              <button key={t.id} onClick={() => { setTab(t.id); setPage(0) }} style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', transition: 'all 0.15s',
                background: tab === t.id ? 'rgba(74,144,217,0.15)' : 'transparent',
                color: tab === t.id ? '#4A90D9' : '#9090aa',
              }}>
                {t.label} {count > 0 && (
                  <span style={{
                    marginLeft: 6, background: tab === t.id ? '#4A90D9' : '#2a2a3a',
                    color: tab === t.id ? '#fff' : '#6060a0',
                    padding: '1px 7px', borderRadius: 20, fontSize: 11,
                  }}>{count}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Job list */}
        {paginated.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '64px 24px', color: '#6060a0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>
              {search ? '🔍' : tab === 'done' ? '✓' : '🤖'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#c0c0d8', marginBottom: 8 }}>
              {search ? `No results for "${search}"` : tab === 'all' ? 'No jobs yet' : `No ${tab} jobs`}
            </div>
            <div style={{ fontSize: 14 }}>
              {tab === 'all' && !search
                ? 'Run the engine from Dashboard to start finding jobs'
                : search
                  ? 'Try a different search term'
                  : `Jobs in ${tab} state will appear here`
              }
            </div>
            {tab === 'all' && !search && (
              <button className="btn-primary" onClick={() => router.push('/dashboard')} style={{ marginTop: 20 }}>
                Go to Dashboard →
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {paginated.map(job => <JobCard key={job.id} job={job} />)}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24, alignItems: 'center' }}>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid #2a2a3a',
                  background: 'transparent', color: page === 0 ? '#3a3a5a' : '#9090aa',
                  cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 13,
                }}>← Prev</button>

                <span style={{ fontSize: 13, color: '#6060a0' }}>
                  Page {page + 1} of {totalPages} · {filtered.length} total
                </span>

                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid #2a2a3a',
                  background: 'transparent', color: page >= totalPages - 1 ? '#3a3a5a' : '#9090aa',
                  cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontSize: 13,
                }}>Next →</button>
              </div>
            )}
          </>
        )}

        {/* Score legend */}
        <div className="card" style={{ marginTop: 32, padding: '14px 20px', display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12 }}>
          <span style={{ color: '#9090aa' }}>Score legend:</span>
          {[
            { label: '70+ Great match', color: '#06d6a0' },
            { label: '50-69 Good match', color: '#f0a500' },
            { label: '<50 Low match', color: '#e74c3c' },
          ].map(l => (
            <span key={l.label} style={{ color: l.color, fontWeight: 500 }}>{l.label}</span>
          ))}
        </div>
      </main>
    </>
  )
}
