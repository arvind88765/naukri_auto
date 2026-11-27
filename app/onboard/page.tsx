'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'

type Step = 'naukri' | 'prefs' | 'resume'

interface Prefs {
  targetRole: string
  experience: string
  locations: string[]
  minSalary: string
  wfhPreference: string
  skills: string
}

interface ConnectedProfile {
  name: string
  email: string
  profileId: string
  resumeHeadline?: string
  keySkills?: string
  experience?: { year: string; month: string }
  locations?: { id: number; value: string }[]
  noticePeriod?: { id: number; value: string }
}

const LOCATIONS = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Ahmedabad', 'Remote']
const WFH_OPTS = [
  { value: 'remote', label: '🏠 Remote only' },
  { value: 'hybrid', label: '🏢 Hybrid' },
  { value: 'onsite', label: '🏗️ Onsite only' },
  { value: 'any', label: '✅ Any' },
]

export default function OnboardPage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const [step, setStep] = useState<Step>('naukri')

  // Auto-connect state
  const [autoConnecting, setAutoConnecting] = useState(false)
  const [autoConnectDone, setAutoConnectDone] = useState(false)
  const [autoConnectError, setAutoConnectError] = useState('')
  const [needsManualFallback, setNeedsManualFallback] = useState(false)
  const [connectedProfile, setConnectedProfile] = useState<ConnectedProfile | null>(null)

  // Manual cookie fallback state
  const [cookieStr, setCookieStr] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')
  const [showCookieGuide, setShowCookieGuide] = useState(false)

  // Prefs state
  const [prefs, setPrefs] = useState<Prefs>({
    targetRole: '', experience: '', locations: [],
    minSalary: '', wfhPreference: 'any', skills: '',
  })
  const [savingPrefs, setSavingPrefs] = useState(false)

  // Resume state
  const [resumeText, setResumeText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [savingResume, setSavingResume] = useState(false)
  const [extracted, setExtracted] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
    if (status === 'authenticated') {
      const user = session?.user as { onboardingCompleted?: boolean; naukriConnected?: boolean } | undefined
      if (user?.onboardingCompleted && user?.naukriConnected) {
        router.push('/dashboard')
      } else if (user?.naukriConnected) {
        setStep('prefs')
      } else if (step === 'naukri' && !autoConnectDone && !autoConnecting && !needsManualFallback) {
        // Auto-trigger Naukri connect on mount — zero user interaction needed
        handleAutoConnect()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session?.user?.id])

  const handleAutoConnect = async () => {
    setAutoConnecting(true)
    setAutoConnectError('')
    try {
      const res = await fetch('/api/naukri/auto-connect', { method: 'POST' })
      const data = await res.json()

      if (res.ok && data.success) {
        setConnectedProfile(data.profile)
        setAutoConnectDone(true)
        await update()
        // Small delay so user sees the success state
        setTimeout(() => setStep('prefs'), 1200)
      } else if (data.needsReauth) {
        // Google token expired — ask user to re-login
        setAutoConnectError('Your Google session expired. Please sign out and sign in again.')
        setAutoConnecting(false)
      } else if (data.fallbackToManual) {
        // Auto-connect couldn't reach Naukri's Google endpoint — show manual fallback
        setNeedsManualFallback(true)
        setAutoConnecting(false)
      } else {
        setAutoConnectError(data.message || 'Auto-connect failed')
        setNeedsManualFallback(true)
        setAutoConnecting(false)
      }
    } catch (e) {
      setAutoConnectError('Network error during auto-connect')
      setNeedsManualFallback(true)
      setAutoConnecting(false)
    }
  }

  // Auto-fill prefs from connected profile
  useEffect(() => {
    if (!connectedProfile) return
    setPrefs(p => ({
      ...p,
      skills: connectedProfile.keySkills || p.skills,
      locations: connectedProfile.locations?.map(l => l.value).filter(v =>
        LOCATIONS.includes(v)
      ) || p.locations,
    }))
  }, [connectedProfile])

  const handleNaukriConnect = async () => {
    if (!cookieStr.trim()) return
    setConnecting(true)
    setConnectError('')
    try {
      const res = await fetch('/api/naukri/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookieStr: cookieStr.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Connection failed')
      setConnectedProfile(data.profile)
      await update()
      setStep('prefs')
    } catch (e: unknown) {
      setConnectError(e instanceof Error ? e.message : 'Failed to connect Naukri account')
    } finally {
      setConnecting(false)
    }
  }

  const handleSavePrefs = async () => {
    if (!prefs.targetRole) return
    setSavingPrefs(true)
    try {
      await fetch('/api/naukri/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetRole: prefs.targetRole,
          experience: parseFloat(prefs.experience) || 0,
          locations: prefs.locations,
          minSalary: parseInt(prefs.minSalary) || 0,
          wfhPreference: prefs.wfhPreference,
          skills: prefs.skills.split(',').map(s => s.trim()).filter(Boolean),
        }),
      })
      setStep('resume')
    } finally {
      setSavingPrefs(false)
    }
  }

  const handleExtractResume = async () => {
    if (!resumeText.trim()) return
    setExtracting(true)
    try {
      const res = await fetch('/api/ai/tailor?action=extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText }),
      })
      const data = await res.json()
      setExtracted(data)
    } finally {
      setExtracting(false)
    }
  }

  const handleSaveResume = async () => {
    if (!resumeText.trim()) return
    setSavingResume(true)
    try {
      await fetch('/api/naukri/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText, onboardingCompleted: true }),
      })
      await update()
      router.push('/dashboard')
    } finally {
      setSavingResume(false)
    }
  }

  const toggleLocation = (loc: string) => {
    setPrefs(p => ({
      ...p,
      locations: p.locations.includes(loc)
        ? p.locations.filter(l => l !== loc)
        : [...p.locations, loc],
    }))
  }

  if (status === 'loading') {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  }

  const steps: { id: Step; label: string; num: number }[] = [
    { id: 'naukri', label: 'Connect Naukri', num: 1 },
    { id: 'prefs', label: 'Your Goals', num: 2 },
    { id: 'resume', label: 'Resume', num: 3 },
  ]

  const stepIdx = { naukri: 0, prefs: 1, resume: 2 }

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 580, margin: '0 auto', padding: '48px 24px' }}>
        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 48 }}>
          {steps.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700,
                  background: step === s.id ? '#4A90D9' : stepIdx[step] > i ? 'rgba(6,214,160,0.2)' : '#1a1a2e',
                  color: step === s.id ? '#fff' : stepIdx[step] > i ? '#06d6a0' : '#9090aa',
                  border: `2px solid ${step === s.id ? '#4A90D9' : stepIdx[step] > i ? 'rgba(6,214,160,0.4)' : '#2a2a3a'}`,
                  transition: 'all 0.3s',
                }}>
                  {stepIdx[step] > i ? '✓' : s.num}
                </div>
                <span style={{ fontSize: 13, color: step === s.id ? '#e0e0f0' : '#6060a0', fontWeight: step === s.id ? 600 : 400 }}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: 1, background: '#2a2a3a', margin: '0 16px' }} />
              )}
            </div>
          ))}
        </div>

        {/* ── Step 1: Auto Naukri Connect ── */}
        {step === 'naukri' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Connecting your Naukri account</h1>
            <p style={{ color: '#9090aa', marginBottom: 32, lineHeight: 1.6 }}>
              Since you&apos;re logged in with Google, we can connect your Naukri account automatically.
            </p>

            {/* Auto-connect spinner / success / error */}
            {!needsManualFallback && (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: '48px 24px', gap: 20,
                background: autoConnectDone
                  ? 'rgba(6,214,160,0.06)'
                  : autoConnectError
                    ? 'rgba(231,76,60,0.06)'
                    : 'rgba(74,144,217,0.06)',
                border: `1px solid ${autoConnectDone ? 'rgba(6,214,160,0.2)' : autoConnectError ? 'rgba(231,76,60,0.2)' : 'rgba(74,144,217,0.15)'}`,
                borderRadius: 16,
              }}>
                {autoConnecting && (
                  <>
                    <div className="spinner" style={{ width: 48, height: 48 }} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#c0c0d8', marginBottom: 6 }}>
                        Connecting to Naukri...
                      </div>
                      <div style={{ fontSize: 13, color: '#6060a0' }}>
                        Using your Google account to authenticate
                      </div>
                    </div>
                  </>
                )}

                {autoConnectDone && (
                  <>
                    <div style={{ fontSize: 48 }}>✅</div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#06d6a0', marginBottom: 6 }}>
                        Connected! Welcome, {connectedProfile?.name || session?.user?.name || 'User'}
                      </div>
                      <div style={{ fontSize: 13, color: '#6060a0' }}>
                        {connectedProfile?.email || session?.user?.email} · Moving to next step...
                      </div>
                    </div>
                  </>
                )}

                {autoConnectError && !autoConnecting && (
                  <>
                    <div style={{ fontSize: 40 }}>⚠️</div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#e74c3c', marginBottom: 8 }}>
                        {autoConnectError}
                      </div>
                      <button
                        className="btn-primary"
                        onClick={handleAutoConnect}
                        style={{ fontSize: 13, padding: '8px 20px' }}
                      >
                        Retry
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Manual cookie fallback — only shown when auto-connect fails */}
            {needsManualFallback && (
              <div>
                <div style={{
                  padding: '12px 16px', background: 'rgba(255,170,0,0.08)',
                  border: '1px solid rgba(255,170,0,0.2)', borderRadius: 10,
                  fontSize: 13, color: '#ffaa44', marginBottom: 24, lineHeight: 1.5,
                }}>
                  ⚡ Auto-connect unavailable right now. Use the manual method below — takes about 30 seconds.
                </div>

                <div style={{ background: 'rgba(74,144,217,0.08)', border: '1px solid rgba(74,144,217,0.2)', borderRadius: 10, padding: 14, marginBottom: 20, fontSize: 13, color: '#4A90D9', lineHeight: 1.5 }}>
                  🔒 Cookies are AES-256 encrypted and stored only on your account. Auto-deleted after 30 days.
                </div>

                <button
                  onClick={() => setShowCookieGuide(v => !v)}
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 10, fontSize: 14,
                    background: showCookieGuide ? 'rgba(74,144,217,0.1)' : 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(74,144,217,0.3)', color: '#c0c0d8',
                    cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <span>📋 How to get your Naukri cookies (30 seconds)</span>
                  <span style={{ fontSize: 18 }}>{showCookieGuide ? '▲' : '▼'}</span>
                </button>

                {showCookieGuide && (
                  <div style={{
                    marginTop: 2, padding: '16px 20px',
                    background: 'rgba(74,144,217,0.05)', border: '1px solid rgba(74,144,217,0.15)',
                    borderRadius: '0 0 10px 10px', fontSize: 13, lineHeight: 1.8,
                  }}>
                    <div style={{ color: '#06d6a0', fontWeight: 700, marginBottom: 12 }}>Step-by-step (Chrome):</div>
                    <ol style={{ margin: 0, paddingLeft: 20, color: '#c0c0d8' }}>
                      <li>Open <strong>naukri.com</strong> in Chrome (logged in with Google)</li>
                      <li>Press <kbd style={{ background: '#1a1a2e', border: '1px solid #3a3a5a', borderRadius: 4, padding: '1px 5px' }}>F12</kbd> → <strong>Console</strong> tab</li>
                      <li>Paste this command and hit Enter:</li>
                    </ol>
                    <div style={{
                      marginTop: 10, padding: '10px 14px',
                      background: '#0a0a1a', border: '1px solid #2a2a3a', borderRadius: 8,
                      fontFamily: 'monospace', fontSize: 12, color: '#06d6a0',
                      cursor: 'text', userSelect: 'all',
                    }}>
                      copy(document.cookie)
                    </div>
                    <div style={{ marginTop: 8, color: '#6060a0', fontSize: 12 }}>
                      This copies your cookies. Paste them below ↓
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 20 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#c0c0d8' }}>
                    Paste your Naukri cookies here
                  </label>
                  <textarea
                    className="input"
                    rows={4}
                    placeholder={'nauk_at=eyJhbGc...; nkid=abc123; _t=xyz789; ...'}
                    value={cookieStr}
                    onChange={e => setCookieStr(e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box', resize: 'vertical',
                      fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5,
                    }}
                  />
                </div>

                {connectError && (
                  <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 8, fontSize: 13, color: '#e74c3c', lineHeight: 1.5 }}>
                    ⚠ {connectError}
                  </div>
                )}

                <button
                  className="btn-primary"
                  onClick={handleNaukriConnect}
                  disabled={connecting || cookieStr.trim().length < 10}
                  style={{ marginTop: 20, width: '100%', opacity: connecting || cookieStr.trim().length < 10 ? 0.6 : 1 }}
                >
                  {connecting ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                      <div className="spinner" style={{ width: 16, height: 16 }} /> Verifying...
                    </span>
                  ) : 'Connect Naukri →'}
                </button>
              </div>
            )}

            <p style={{ fontSize: 12, color: '#6060a0', marginTop: 24, textAlign: 'center', lineHeight: 1.6 }}>
              🔒 We only use your credentials to apply to jobs on your behalf.<br />
              Never shared with third parties.
            </p>
          </div>
        )}

        {/* ── Step 2: Preferences ── */}
        {step === 'prefs' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>What are you looking for?</h1>
            {connectedProfile && (
              <div style={{ marginBottom: 20, padding: '12px 16px', background: 'rgba(6,214,160,0.08)', border: '1px solid rgba(6,214,160,0.2)', borderRadius: 10, fontSize: 13, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <div>
                  <div style={{ color: '#06d6a0', fontWeight: 700 }}>Connected as {connectedProfile.name}</div>
                  <div style={{ color: '#9090aa', fontSize: 12 }}>{connectedProfile.email} · Profile fetched from Naukri</div>
                </div>
              </div>
            )}
            <p style={{ color: '#9090aa', marginBottom: 32 }}>This helps our AI find and score the right jobs for you.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#c0c0d8' }}>
                  Target Role *
                </label>
                <input className="input" placeholder="e.g. Software Engineer, Data Analyst" value={prefs.targetRole}
                  onChange={e => setPrefs(p => ({ ...p, targetRole: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#c0c0d8' }}>
                  Years of Experience
                </label>
                <input className="input" type="number" placeholder="e.g. 0 (fresher), 2, 5" value={prefs.experience}
                  onChange={e => setPrefs(p => ({ ...p, experience: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#c0c0d8' }}>
                  Preferred Locations
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {LOCATIONS.map(loc => (
                    <button key={loc} onClick={() => toggleLocation(loc)} style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                      border: `1px solid ${prefs.locations.includes(loc) ? '#4A90D9' : '#2a2a3a'}`,
                      background: prefs.locations.includes(loc) ? 'rgba(74,144,217,0.15)' : 'transparent',
                      color: prefs.locations.includes(loc) ? '#4A90D9' : '#9090aa',
                      transition: 'all 0.15s',
                    }}>{loc}</button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#c0c0d8' }}>
                  Minimum Salary (₹ LPA)
                </label>
                <input className="input" type="number" placeholder="e.g. 3, 8, 15" value={prefs.minSalary}
                  onChange={e => setPrefs(p => ({ ...p, minSalary: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#c0c0d8' }}>
                  Work Mode
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {WFH_OPTS.map(opt => (
                    <button key={opt.value} onClick={() => setPrefs(p => ({ ...p, wfhPreference: opt.value }))} style={{
                      padding: '10px 14px', borderRadius: 10, fontSize: 14, cursor: 'pointer',
                      border: `1px solid ${prefs.wfhPreference === opt.value ? '#4A90D9' : '#2a2a3a'}`,
                      background: prefs.wfhPreference === opt.value ? 'rgba(74,144,217,0.1)' : 'transparent',
                      color: prefs.wfhPreference === opt.value ? '#4A90D9' : '#9090aa',
                      textAlign: 'left', transition: 'all 0.15s',
                    }}>{opt.label}</button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#c0c0d8' }}>
                  Key Skills (comma-separated)
                </label>
                <input className="input" placeholder="e.g. Python, Machine Learning, Excel, AWS" value={prefs.skills}
                  onChange={e => setPrefs(p => ({ ...p, skills: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box' }} />
                {connectedProfile?.keySkills && (
                  <p style={{ fontSize: 12, color: '#6060a0', marginTop: 6 }}>
                    Pre-filled from your Naukri profile — edit as needed
                  </p>
                )}
              </div>
            </div>

            <button className="btn-primary" onClick={handleSavePrefs} disabled={savingPrefs || !prefs.targetRole}
              style={{ marginTop: 28, width: '100%', opacity: savingPrefs || !prefs.targetRole ? 0.6 : 1 }}>
              {savingPrefs ? 'Saving...' : 'Continue →'}
            </button>
          </div>
        )}

        {/* ── Step 3: Resume ── */}
        {step === 'resume' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Paste your resume</h1>
            <p style={{ color: '#9090aa', marginBottom: 32, lineHeight: 1.6 }}>
              Gemini AI will tailor this for each job. Plain text works best — copy from your Word/PDF doc.
            </p>

            <textarea
              className="input"
              rows={14}
              placeholder={'Paste your full resume here...\n\nInclude: work experience, skills, education, achievements, links'}
              value={resumeText}
              onChange={e => setResumeText(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
            />

            {resumeText.length > 100 && !extracted && (
              <button onClick={handleExtractResume} disabled={extracting} style={{
                marginTop: 12, padding: '8px 16px', borderRadius: 8, fontSize: 13,
                background: 'transparent', border: '1px solid #2a2a3a', color: '#9090aa',
                cursor: extracting ? 'not-allowed' : 'pointer',
              }}>
                {extracting ? '⟳ Extracting info...' : '✨ Preview what AI sees'}
              </button>
            )}

            {extracted && (
              <div style={{ marginTop: 16, padding: 16, background: 'rgba(6,214,160,0.05)', border: '1px solid rgba(6,214,160,0.2)', borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#06d6a0', marginBottom: 10 }}>✓ AI successfully parsed your resume</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                  {Object.entries(extracted as Record<string, unknown>).slice(0, 6).map(([k, v]) => (
                    <div key={k}>
                      <span style={{ color: '#6060a0' }}>{k}: </span>
                      <span style={{ color: '#c0c0d8' }}>{Array.isArray(v) ? (v as string[]).slice(0, 3).join(', ') : String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button className="btn-primary" onClick={handleSaveResume} disabled={savingResume || resumeText.length < 50}
              style={{ marginTop: 24, width: '100%', opacity: savingResume || resumeText.length < 50 ? 0.6 : 1 }}>
              {savingResume ? 'Saving & launching dashboard...' : '🚀 Start auto-applying →'}
            </button>

            <p style={{ fontSize: 12, color: '#6060a0', marginTop: 12, textAlign: 'center' }}>
              You can update your resume anytime from the dashboard
            </p>
          </div>
        )}
      </main>
    </>
  )
}
