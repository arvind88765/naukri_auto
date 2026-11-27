'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import Navbar from '@/components/Navbar'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ResumeData {
  name: string
  email: string
  phone: string
  linkedin: string
  github: string
  summary?: string
  education: { institution: string; degree: string; year: string; score: string }[]
  skills: { category: string; items: string }[]
  projects: { title: string; tech: string; bullets: string[] }[]
  certifications: string[]
  languages: string[]
  declaration: boolean
}

const EMPTY_RESUME: ResumeData = {
  name: '', email: '', phone: '', linkedin: '', github: '',
  education: [{ institution: '', degree: '', year: '', score: '' }],
  skills: [
    { category: 'Programming Languages', items: '' },
    { category: 'Tools & Frameworks', items: '' },
    { category: 'Other', items: '' },
  ],
  projects: [{ title: '', tech: '', bullets: ['', ''] }],
  certifications: [''],
  languages: ['English'],
  declaration: true,
}

// ─── LaTeX Preview Component ──────────────────────────────────────────────────

// Strip URL to handle — linkedin.com/in/handle → handle, github.com/user → user
function stripHandle(url: string, type: 'linkedin' | 'github'): string {
  if (!url) return ''
  const clean = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  if (type === 'linkedin') return clean.replace(/^linkedin\.com\/in\//, 'linkedin.com/in/')
  if (type === 'github') return clean.replace(/^github\.com\//, 'github.com/')
  return clean
}

function ResumePreview({ data }: { data: ResumeData }) {
  const HR = () => <hr style={{ border: 'none', borderTop: '1.2px solid #111', margin: '3px 0 5px' }} />

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 9 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 1 }}>{title}</div>
      <HR />
      {children}
    </div>
  )

  const contactParts = [
    data.email,
    data.phone,
    data.linkedin ? stripHandle(data.linkedin, 'linkedin') : '',
    data.github ? stripHandle(data.github, 'github') : '',
  ].filter(Boolean)

  return (
    <div style={{
      fontFamily: '"Times New Roman", Times, serif',
      fontSize: 10.5,
      lineHeight: 1.45,
      color: '#111',
      background: '#fff',
      padding: '28px 36px 24px',
      width: '210mm',       // true A4 width
      minWidth: '210mm',
      boxSizing: 'border-box',
    }}>
      {/* ── Header ── */}
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.5, marginBottom: 3 }}>
          {data.name || 'Your Name'}
        </div>
        <div style={{ fontSize: 9.5, color: '#222', letterSpacing: 0.1 }}>
          {contactParts.join('  ·  ')}
        </div>
      </div>

      {/* ── Summary ── */}
      {data.summary && (
        <Section title="Summary">
          <div style={{ fontSize: 10.5, lineHeight: 1.5, textAlign: 'justify' }}>{data.summary}</div>
        </Section>
      )}

      {/* ── Education ── */}
      {data.education.some(e => e.institution) && (
        <Section title="Education">
          {data.education.filter(e => e.institution).map((e, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
              <div>
                <span style={{ fontWeight: 700 }}>{e.institution}</span>
                {e.degree && <span style={{ fontStyle: 'italic' }}> · {e.degree}</span>}
                {e.score && <span style={{ color: '#444' }}> · {e.score}</span>}
              </div>
              <div style={{ color: '#444', flexShrink: 0, marginLeft: 8, fontSize: 10 }}>{e.year}</div>
            </div>
          ))}
        </Section>
      )}

      {/* ── Skills ── */}
      {data.skills.some(s => s.items) && (
        <Section title="Technical Skills">
          {data.skills.filter(s => s.items).map((s, i) => (
            <div key={i} style={{ marginBottom: 2, lineHeight: 1.4 }}>
              <span style={{ fontWeight: 700 }}>{s.category}: </span>
              <span style={{ color: '#222' }}>{s.items}</span>
            </div>
          ))}
        </Section>
      )}

      {/* ── Projects ── */}
      {data.projects.some(p => p.title) && (
        <Section title="Projects">
          {data.projects.filter(p => p.title).map((p, i) => (
            <div key={i} style={{ marginBottom: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 700, fontSize: 10.5 }}>{p.title}</span>
                {p.tech && <span style={{ fontStyle: 'italic', color: '#444', fontSize: 9.5 }}>{p.tech}</span>}
              </div>
              <ul style={{ margin: '2px 0 0 14px', padding: 0 }}>
                {p.bullets.filter(Boolean).map((b, j) => (
                  <li key={j} style={{ marginBottom: 1.5, lineHeight: 1.4 }}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      )}

      {/* ── Certifications ── */}
      {data.certifications.some(Boolean) && (
        <Section title="Certifications">
          <ul style={{ margin: '0 0 0 14px', padding: 0 }}>
            {data.certifications.filter(Boolean).map((c, i) => (
              <li key={i} style={{ marginBottom: 1.5 }}>{c}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── Languages ── */}
      {data.languages.some(Boolean) && (
        <Section title="Languages">
          <div>{data.languages.filter(Boolean).join(', ')}</div>
        </Section>
      )}

      {/* ── Declaration ── */}
      {data.declaration && (
        <Section title="Declaration">
          <div style={{ fontSize: 10, color: '#333', lineHeight: 1.5 }}>
            I hereby declare that the above information is true and correct to the best of my knowledge and belief.
          </div>
        </Section>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ResumePage() {
  const { status } = useSession()
  const router = useRouter()
  const [resume, setResume] = useState<ResumeData>(EMPTY_RESUME)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiTarget, setAiTarget] = useState('')
  const [aiRunning, setAiRunning] = useState(false)
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit')
  const printRef = useRef<HTMLDivElement>(null)

  // Import modal state
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
    if (status === 'authenticated') loadResume()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const loadResume = async () => {
    try {
      const res = await fetch('/api/resume')
      if (res.ok) {
        const data = await res.json()
        if (data.resume) setResume(data.resume)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('/api/resume', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const handleImport = async () => {
    if (!importText.trim() || importText.length < 50) return
    setImporting(true)
    setImportError('')
    try {
      const res = await fetch('/api/resume/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: importText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      if (data.resume) {
        // Map AI field names → ResumeData interface field names
        const r = data.resume
        const mapped: ResumeData = {
          name: r.name || '',
          email: r.email || '',
          phone: r.phone || '',
          linkedin: r.linkedin || '',
          github: r.github || '',
          summary: r.summary || '',
          education: (r.education || []).map((e: { institution?: string; degree?: string; year?: string; cgpa?: string; score?: string }) => ({
            institution: e.institution || '',
            degree: e.degree || '',
            year: e.year || '',
            score: e.cgpa || e.score || '',
          })),
          skills: (r.skills || []).map((s: { category?: string; items?: string[] | string }) => ({
            category: s.category || '',
            items: Array.isArray(s.items) ? s.items.join(', ') : (s.items || ''),
          })),
          projects: [
            // Experience entries converted to projects
            ...(r.experience || []).map((e: { role?: string; company?: string; duration?: string; points?: string[] }) => ({
              title: e.role ? `${e.role}${e.company ? ' @ ' + e.company : ''}` : '',
              tech: e.duration || '',
              bullets: Array.isArray(e.points) ? e.points : [],
            })),
            // Actual projects
            ...(r.projects || []).map((p: { name?: string; title?: string; tech?: string; points?: string[]; bullets?: string[] }) => ({
              title: p.name || p.title || '',
              tech: p.tech || '',
              bullets: Array.isArray(p.points) ? p.points : (Array.isArray(p.bullets) ? p.bullets : []),
            })),
          ],
          certifications: r.certifications || [],
          languages: r.languages?.length ? r.languages : ['English'],
          declaration: true,
        }
        setResume(mapped)
        setShowImport(false)
        setImportText('')
      }
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : 'AI parsing failed')
    } finally {
      setImporting(false)
    }
  }

  const handleAiEdit = async () => {
    if (!aiPrompt.trim()) return
    setAiRunning(true)
    try {
      const res = await fetch('/api/resume/ai-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume, prompt: aiPrompt, targetJob: aiTarget }),
      })
      const data = await res.json()
      if (data.resume) {
        setResume(data.resume)
        setAiPrompt('')
      }
    } finally {
      setAiRunning(false)
    }
  }

  const handlePrint = () => {
    if (!printRef.current) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`
      <html><head><title>${resume.name || 'Resume'}</title>
      <style>
        body { margin: 0; font-family: "Times New Roman", serif; font-size: 11pt; }
        @page { margin: 0.5in; size: A4; }
        @media print { body { -webkit-print-color-adjust: exact; } }
      </style></head>
      <body>${printRef.current.innerHTML}</body></html>
    `)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 500)
  }

  const setField = <K extends keyof ResumeData>(key: K, val: ResumeData[K]) => {
    setResume(r => ({ ...r, [key]: val }))
  }

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  }

  const inputStyle: React.CSSProperties = {
    background: '#12121e', border: '1px solid #2a2a3a', borderRadius: 6,
    padding: '7px 10px', fontSize: 13, color: '#e0e0f0', width: '100%', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = { fontSize: 12, color: '#9090aa', marginBottom: 4, display: 'block' }

  return (
    <>
      <Navbar />

      {/* ── Import Modal ── */}
      {showImport && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }} onClick={e => e.target === e.currentTarget && setShowImport(false)}>
          <div style={{
            background: '#13131f', border: '1px solid #2a2a3a', borderRadius: 14,
            padding: 28, width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Import your resume</h2>
                <p style={{ color: '#9090aa', fontSize: 13, margin: '6px 0 0' }}>
                  Paste your resume — Word, PDF copy, LinkedIn export, anything. AI will parse and fill all fields.
                </p>
              </div>
              <button onClick={() => setShowImport(false)} style={{
                background: 'transparent', border: 'none', color: '#6060a0', fontSize: 22,
                cursor: 'pointer', lineHeight: 1, flexShrink: 0, marginLeft: 16,
              }}>×</button>
            </div>

            <textarea
              rows={16}
              placeholder={`Paste your full resume here...\n\nAnything works:\n• Copy-paste from Word / Google Docs\n• Plain text from PDF\n• LinkedIn "Save to PDF" then paste\n• Even messy formatting — AI handles it\n\nExample:\nJohn Doe | john@email.com | +91 9876543210 | linkedin.com/in/johndoe\n\nEducation\nIIT Delhi | B.Tech Computer Science | 2021-2025 | 8.7 CGPA\n\nProjects\nNaukriAuto — Next.js, Supabase, Gemini AI\n• Built AI-powered job application automation for Naukri.com\n• Reduced manual apply time by 95%\n\nSkills\nPython, JavaScript, React, SQL, Machine Learning`}
              value={importText}
              onChange={e => setImportText(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box', borderRadius: 8,
                background: '#0d0d1a', border: '1px solid #2a2a3a',
                color: '#e0e0f0', fontSize: 13, padding: 14, resize: 'vertical',
                lineHeight: 1.6, fontFamily: 'monospace',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <div style={{ fontSize: 12, color: '#6060a0' }}>
                {importText.length > 0 ? `${importText.length} chars · ${importText.trim().split(/\s+/).length} words` : 'The more detail, the better the parse'}
              </div>
              <div style={{ fontSize: 12, color: '#4A90D9' }}>Powered by Gemini AI</div>
            </div>

            {importError && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.2)', color: '#e74c3c', fontSize: 13 }}>
                ⚠ {importError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setShowImport(false)} style={{
                flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #2a2a3a',
                background: 'transparent', color: '#9090aa', cursor: 'pointer', fontSize: 14,
              }}>Cancel</button>
              <button
                onClick={handleImport}
                disabled={importing || importText.length < 50}
                className="btn-primary"
                style={{ flex: 2, padding: '10px', fontSize: 14, opacity: importing || importText.length < 50 ? 0.6 : 1 }}
              >
                {importing ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <div className="spinner" style={{ width: 16, height: 16 }} /> Parsing with AI...
                  </span>
                ) : '✨ Parse & Fill All Fields →'}
              </button>
            </div>

            <p style={{ fontSize: 11, color: '#4a4a6a', marginTop: 12, textAlign: 'center' }}>
              Your data never leaves your account · You can edit any field after import
            </p>
          </div>
        </div>
      )}

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Resume Builder</h1>
            <p style={{ color: '#9090aa', fontSize: 13, margin: '4px 0 0' }}>
              1-page LaTeX-style · AI auto-edit per job · Freshers-first
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setShowImport(true)} style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(74,144,217,0.4)',
              background: 'rgba(74,144,217,0.08)', color: '#4A90D9', fontSize: 13, cursor: 'pointer', fontWeight: 600,
            }}>
              ⬇ Import Resume
            </button>
            <button onClick={handlePrint} style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid #2a2a3a',
              background: 'transparent', color: '#9090aa', fontSize: 13, cursor: 'pointer',
            }}>
              🖨 Print / PDF
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ padding: '8px 20px', fontSize: 13 }}>
              {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Resume'}
            </button>
          </div>
        </div>

        {/* Mobile tab switch */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, border: '1px solid #2a2a3a', borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
          {(['edit', 'preview'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '8px 20px', fontSize: 13, border: 'none', cursor: 'pointer',
              background: activeTab === tab ? '#4A90D9' : 'transparent',
              color: activeTab === tab ? '#fff' : '#9090aa',
              textTransform: 'capitalize',
            }}>{tab === 'edit' ? '✏ Edit' : '👁 Preview'}</button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: activeTab === 'edit' ? '1fr 480px' : '1fr', gap: 24 }}>
          {/* Editor */}
          {activeTab === 'edit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* AI Edit Bar */}
              <div style={{ background: 'rgba(74,144,217,0.06)', border: '1px solid rgba(74,144,217,0.2)', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#4A90D9', marginBottom: 10 }}>✨ AI Auto-Edit</div>
                <input
                  style={{ ...inputStyle, marginBottom: 8 }}
                  placeholder='Target job (e.g. "Software Engineer at Google")'
                  value={aiTarget}
                  onChange={e => setAiTarget(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder='What to change? (e.g. "Highlight Python projects", "Make more concise")'
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAiEdit()}
                  />
                  <button onClick={handleAiEdit} disabled={aiRunning || !aiPrompt.trim()} style={{
                    padding: '7px 16px', borderRadius: 6, border: 'none', fontSize: 13,
                    background: aiRunning || !aiPrompt.trim() ? '#2a2a3a' : '#4A90D9',
                    color: '#fff', cursor: aiRunning || !aiPrompt.trim() ? 'not-allowed' : 'pointer',
                    flexShrink: 0, whiteSpace: 'nowrap',
                  }}>
                    {aiRunning ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="spinner" style={{ width: 12, height: 12 }} /> editing...
                      </span>
                    ) : '→ Run AI'}
                  </button>
                </div>
              </div>

              {/* Personal Info */}
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: '#c0c0d8' }}>Personal Info</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {(['name', 'email', 'phone', 'linkedin', 'github'] as const).map(f => (
                    <div key={f} style={{ gridColumn: f === 'name' ? '1 / -1' : undefined }}>
                      <label style={labelStyle}>{f.charAt(0).toUpperCase() + f.slice(1)}</label>
                      <input style={inputStyle} value={resume[f]} onChange={e => setField(f, e.target.value)}
                        placeholder={f === 'linkedin' ? 'username (no URL)' : f === 'github' ? 'username' : ''} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Education */}
              <div className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#c0c0d8' }}>Education</div>
                  <button onClick={() => setField('education', [...resume.education, { institution: '', degree: '', year: '', score: '' }])}
                    style={{ fontSize: 12, color: '#4A90D9', background: 'transparent', border: 'none', cursor: 'pointer' }}>+ Add</button>
                </div>
                {resume.education.map((e, i) => (
                  <div key={i} style={{ marginBottom: i < resume.education.length - 1 ? 14 : 0, paddingBottom: i < resume.education.length - 1 ? 14 : 0, borderBottom: i < resume.education.length - 1 ? '1px solid #1a1a2e' : 'none' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={labelStyle}>Institution</label>
                        <input style={inputStyle} value={e.institution} onChange={ev => {
                          const ed = [...resume.education]; ed[i] = { ...ed[i], institution: ev.target.value }; setField('education', ed)
                        }} placeholder="College / University" />
                      </div>
                      <div>
                        <label style={labelStyle}>Degree</label>
                        <input style={inputStyle} value={e.degree} onChange={ev => {
                          const ed = [...resume.education]; ed[i] = { ...ed[i], degree: ev.target.value }; setField('education', ed)
                        }} placeholder="B.Tech CSE" />
                      </div>
                      <div>
                        <label style={labelStyle}>Year</label>
                        <input style={inputStyle} value={e.year} onChange={ev => {
                          const ed = [...resume.education]; ed[i] = { ...ed[i], year: ev.target.value }; setField('education', ed)
                        }} placeholder="2021 – 2025" />
                      </div>
                      <div>
                        <label style={labelStyle}>Score (CGPA / %)</label>
                        <input style={inputStyle} value={e.score} onChange={ev => {
                          const ed = [...resume.education]; ed[i] = { ...ed[i], score: ev.target.value }; setField('education', ed)
                        }} placeholder="8.4 CGPA" />
                      </div>
                    </div>
                    {resume.education.length > 1 && (
                      <button onClick={() => setField('education', resume.education.filter((_, j) => j !== i))}
                        style={{ marginTop: 6, fontSize: 11, color: '#e74c3c', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Skills */}
              <div className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#c0c0d8' }}>Technical Skills</div>
                  <button onClick={() => setField('skills', [...resume.skills, { category: '', items: '' }])}
                    style={{ fontSize: 12, color: '#4A90D9', background: 'transparent', border: 'none', cursor: 'pointer' }}>+ Add Category</button>
                </div>
                {resume.skills.map((s, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <input style={inputStyle} value={s.category} onChange={ev => {
                      const sk = [...resume.skills]; sk[i] = { ...sk[i], category: ev.target.value }; setField('skills', sk)
                    }} placeholder="Category" />
                    <input style={inputStyle} value={s.items} onChange={ev => {
                      const sk = [...resume.skills]; sk[i] = { ...sk[i], items: ev.target.value }; setField('skills', sk)
                    }} placeholder="Python, JavaScript, React, ..." />
                    {resume.skills.length > 1 && (
                      <button onClick={() => setField('skills', resume.skills.filter((_, j) => j !== i))}
                        style={{ color: '#e74c3c', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>×</button>
                    )}
                  </div>
                ))}
              </div>

              {/* Projects */}
              <div className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#c0c0d8' }}>Projects</div>
                  <button onClick={() => setField('projects', [...resume.projects, { title: '', tech: '', bullets: ['', ''] }])}
                    style={{ fontSize: 12, color: '#4A90D9', background: 'transparent', border: 'none', cursor: 'pointer' }}>+ Add Project</button>
                </div>
                {resume.projects.map((p, i) => (
                  <div key={i} style={{ marginBottom: i < resume.projects.length - 1 ? 16 : 0, paddingBottom: i < resume.projects.length - 1 ? 16 : 0, borderBottom: i < resume.projects.length - 1 ? '1px solid #1a1a2e' : 'none' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                      <div>
                        <label style={labelStyle}>Project Title</label>
                        <input style={inputStyle} value={p.title} onChange={ev => {
                          const pr = [...resume.projects]; pr[i] = { ...pr[i], title: ev.target.value }; setField('projects', pr)
                        }} placeholder="NaukriAuto" />
                      </div>
                      <div>
                        <label style={labelStyle}>Tech Stack</label>
                        <input style={inputStyle} value={p.tech} onChange={ev => {
                          const pr = [...resume.projects]; pr[i] = { ...pr[i], tech: ev.target.value }; setField('projects', pr)
                        }} placeholder="Next.js, Supabase, Gemini AI" />
                      </div>
                    </div>
                    <label style={labelStyle}>Bullet Points (what you built / achieved)</label>
                    {p.bullets.map((b, j) => (
                      <div key={j} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                        <span style={{ color: '#6060a0', fontSize: 16 }}>•</span>
                        <input style={{ ...inputStyle, flex: 1 }} value={b} onChange={ev => {
                          const pr = [...resume.projects]
                          pr[i] = { ...pr[i], bullets: pr[i].bullets.map((x, k) => k === j ? ev.target.value : x) }
                          setField('projects', pr)
                        }} placeholder="Built X using Y, resulting in Z% improvement" />
                        {p.bullets.length > 1 && (
                          <button onClick={() => {
                            const pr = [...resume.projects]
                            pr[i] = { ...pr[i], bullets: pr[i].bullets.filter((_, k) => k !== j) }
                            setField('projects', pr)
                          }} style={{ color: '#e74c3c', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16 }}>×</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => {
                      const pr = [...resume.projects]; pr[i] = { ...pr[i], bullets: [...pr[i].bullets, ''] }; setField('projects', pr)
                    }} style={{ fontSize: 12, color: '#4A90D9', background: 'transparent', border: 'none', cursor: 'pointer', marginTop: 2 }}>
                      + Add bullet
                    </button>
                    {resume.projects.length > 1 && (
                      <button onClick={() => setField('projects', resume.projects.filter((_, j) => j !== i))}
                        style={{ marginLeft: 12, fontSize: 12, color: '#e74c3c', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                        Remove project
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Certifications */}
              <div className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#c0c0d8' }}>Certifications</div>
                  <button onClick={() => setField('certifications', [...resume.certifications, ''])}
                    style={{ fontSize: 12, color: '#4A90D9', background: 'transparent', border: 'none', cursor: 'pointer' }}>+ Add</button>
                </div>
                {resume.certifications.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input style={{ ...inputStyle, flex: 1 }} value={c} onChange={ev => {
                      const cert = [...resume.certifications]; cert[i] = ev.target.value; setField('certifications', cert)
                    }} placeholder="AWS Certified Developer · 2024" />
                    {resume.certifications.length > 1 && (
                      <button onClick={() => setField('certifications', resume.certifications.filter((_, j) => j !== i))}
                        style={{ color: '#e74c3c', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16 }}>×</button>
                    )}
                  </div>
                ))}
              </div>

              {/* Languages */}
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#c0c0d8' }}>Languages Known</div>
                <input style={inputStyle} value={resume.languages.join(', ')} onChange={e =>
                  setField('languages', e.target.value.split(',').map(l => l.trim()).filter(Boolean))
                } placeholder="English, Hindi, Telugu" />
              </div>

              {/* Page hint */}
              <div style={{ fontSize: 12, color: '#6060a0', textAlign: 'center', padding: '8px 0' }}>
                💡 Freshers: Keep to 1 page. 2–3 projects, 1 education, clean skills. AI edit helps trim it down.
              </div>
            </div>
          )}

          {/* Preview */}
          <div style={{ position: 'sticky', top: 20 }}>
            {/* toolbar */}
            <div style={{
              background: '#1a1a2e', padding: '10px 16px', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center',
              borderRadius: '8px 8px 0 0', border: '1px solid #2a2a3a', borderBottom: 'none',
            }}>
              <span style={{ fontSize: 12, color: '#6060a0' }}>📄 Live Preview — A4</span>
              <button onClick={handlePrint} style={{ fontSize: 11, color: '#4A90D9', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                Export PDF ↗
              </button>
            </div>

            {/* zoom shrinks element + layout footprint — no blank space at bottom */}
            <div style={{
              border: '1px solid #2a2a3a',
              borderRadius: '0 0 8px 8px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
              background: '#fff',
              width: 420,
              overflow: 'hidden',
            }}>
              <div ref={printRef} style={{ zoom: 0.529 }}>
                <ResumePreview data={resume} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
