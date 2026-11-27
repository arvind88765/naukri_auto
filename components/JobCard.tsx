'use client'

interface JobCardProps {
  job: {
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
    tailored_resume?: {
      coverNote?: string
      matchedKeywords?: string[]
    }
  }
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: '#f0a500', bg: 'rgba(240,165,0,0.1)' },
  scoring: { label: 'Scoring', color: '#4A90D9', bg: 'rgba(74,144,217,0.1)' },
  tailoring: { label: 'Tailoring', color: '#9b59b6', bg: 'rgba(155,89,182,0.1)' },
  applying: { label: 'Applying', color: '#3498db', bg: 'rgba(52,152,219,0.1)' },
  done: { label: 'Applied ✓', color: '#06d6a0', bg: 'rgba(6,214,160,0.1)' },
  failed: { label: 'Failed', color: '#e74c3c', bg: 'rgba(231,76,60,0.1)' },
  skipped: { label: 'Skipped', color: '#7f8c8d', bg: 'rgba(127,140,141,0.1)' },
}

export default function JobCard({ job }: JobCardProps) {
  const cfg = statusConfig[job.status] || statusConfig.pending
  const isActive = ['scoring', 'tailoring', 'applying'].includes(job.status)
  const score = job.match_score

  return (
    <div className="card" style={{ padding: '16px 20px', position: 'relative', overflow: 'hidden' }}>
      {/* Active shimmer */}
      {isActive && (
        <div style={{
          position: 'absolute', top: 0, left: '-100%', width: '100%', height: '100%',
          background: 'linear-gradient(90deg, transparent, rgba(74,144,217,0.05), transparent)',
          animation: 'shimmer 2s infinite',
        }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#e0e0f0' }}>
              {job.job_title}
            </h3>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              color: cfg.color, background: cfg.bg,
            }}>
              {isActive && <span style={{ marginRight: 4 }}>⟳</span>}
              {cfg.label}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#c0c0d8', fontWeight: 500 }}>
              {job.company_name}
            </span>
            {job.location && (
              <span style={{ fontSize: 13, color: '#9090aa' }}>📍 {job.location}</span>
            )}
            {job.salary_range && (
              <span style={{ fontSize: 13, color: '#9090aa' }}>💰 {job.salary_range}</span>
            )}
          </div>

          {job.tailored_resume?.matchedKeywords && job.tailored_resume.matchedKeywords.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {job.tailored_resume.matchedKeywords.slice(0, 5).map((kw: string) => (
                <span key={kw} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 20,
                  background: 'rgba(74,144,217,0.08)', color: '#4A90D9',
                  border: '1px solid rgba(74,144,217,0.2)',
                }}>
                  {kw}
                </span>
              ))}
            </div>
          )}

          {job.error_message && (
            <p style={{ fontSize: 12, color: '#e74c3c', margin: '8px 0 0', background: 'rgba(231,76,60,0.08)', padding: '6px 10px', borderRadius: 6 }}>
              ⚠ {job.error_message}
            </p>
          )}
        </div>

        {/* Match score */}
        {score !== undefined && score !== null && (
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              border: `3px solid ${score >= 70 ? '#06d6a0' : score >= 50 ? '#f0a500' : '#e74c3c'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', background: 'rgba(0,0,0,0.3)',
            }}>
              <span style={{
                fontSize: 15, fontWeight: 800,
                color: score >= 70 ? '#06d6a0' : score >= 50 ? '#f0a500' : '#e74c3c',
              }}>
                {score}
              </span>
            </div>
            <div style={{ fontSize: 10, color: '#6060a0', marginTop: 2 }}>score</div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: '#6060a0' }}>
        {job.applied_at
          ? `Applied ${new Date(job.applied_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
          : `Added ${new Date(job.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
        }
      </div>

      <style>{`
        @keyframes shimmer {
          0% { left: -100%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  )
}
