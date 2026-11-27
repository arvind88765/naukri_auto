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

  // Naukri connect state
  const [naukriEmail, setNaukriEmail] = useState('')
  const [naukriPass, setNaukriPass] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

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
      }
    }
  }, [status, session, router])

  const handleNaukriConnect = async () => {
    if (!naukriEmail || !naukriPass) return
    setConnecting(true)
    setConnectError('')
    try {
      const res = await fetch('/api/naukri/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: naukriEmail, password: naukriPass }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Connection failed')
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

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px' }}>
        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 48 }}>
          {steps.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700,
                  background: step === s.id ? '#4A90D9' : steps.indexOf({ id: step, label: '', num: 0 }) > i ? 'rgba(6,214,160,0.2)' : '#1a1a2e',
                  color: step === s.id ? '#fff' : '#9090aa',
                  border: `2px solid ${step === s.id ? '#4A90D9' : '#2a2a3a'}`,
                  transition: 'all 0.3s',
                }}>
                  {s.num}
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

        {/* Step 1: Naukri Connect */}
        {step === 'naukri' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Connect your Naukri account</h1>
            <p style={{ color: '#9090aa', marginBottom: 32, lineHeight: 1.6 }}>
              We use your credentials to fetch your profile and auto-apply on your behalf.
              Your password is encrypted with AES-256 and never stored in plain text.
            </p>

            <div style={{ background: 'rgba(74,144,217,0.08)', border: '1px solid rgba(74,144,217,0.2)', borderRadius: 10, padding: 16, marginBottom: 24, fontSize: 13, color: '#4A90D9' }}>
              🔒 End-to-end encrypted · We never sell your data · You can disconnect anytime
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#c0c0d8' }}>
                  Naukri Email / Mobile
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="you@email.com"
                  value={naukriEmail}
                  onChange={e => setNaukriEmail(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#c0c0d8' }}>
                  Naukri Password
                </label>
                <input
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={naukriPass}
                  onChange={e => setNaukriPass(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleNaukriConnect()}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {connectError && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 8, fontSize: 13, color: '#e74c3c' }}>
                ⚠ {connectError}
              </div>
            )}

            <button
              className="btn-primary"
              onClick={handleNaukriConnect}
              disabled={connecting || !naukriEmail || !naukriPass}
              style={{ marginTop: 24, width: '100%', opacity: connecting || !naukriEmail || !naukriPass ? 0.6 : 1 }}
            >
              {connecting ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <div className="spinner" style={{ width: 16, height: 16 }} /> Connecting...
                </span>
              ) : 'Connect Naukri →'}
            </button>
          </div>
        )}

        {/* Step 2: Preferences */}
        {step === 'prefs' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>What are you looking for?</h1>
            <p style={{ color: '#9090aa', marginBottom: 32 }}>This helps our AI find and score the right jobs for you.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#c0c0d8' }}>
                  Target Role *
                </label>
                <input className="input" placeholder="e.g. Senior Software Engineer" value={prefs.targetRole}
                  onChange={e => setPrefs(p => ({ ...p, targetRole: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#c0c0d8' }}>
                  Years of Experience
                </label>
                <input className="input" type="number" placeholder="e.g. 4" value={prefs.experience}
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
                <input className="input" type="number" placeholder="e.g. 12" value={prefs.minSalary}
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
                <input className="input" placeholder="e.g. React, Node.js, PostgreSQL, AWS" value={prefs.skills}
                  onChange={e => setPrefs(p => ({ ...p, skills: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
            </div>

            <button className="btn-primary" onClick={handleSavePrefs} disabled={savingPrefs || !prefs.targetRole}
              style={{ marginTop: 28, width: '100%', opacity: savingPrefs || !prefs.targetRole ? 0.6 : 1 }}>
              {savingPrefs ? 'Saving...' : 'Continue →'}
            </button>
          </div>
        )}

        {/* Step 3: Resume */}
        {step === 'resume' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Paste your resume</h1>
            <p style={{ color: '#9090aa', marginBottom: 32, lineHeight: 1.6 }}>
              Claude AI will tailor this for each job. Plain text works best — copy from your Word/PDF doc.
            </p>

            <textarea
              className="input"
              rows={14}
              placeholder="Paste your full resume here...&#10;&#10;Include: work experience, skills, education, achievements, links"
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
