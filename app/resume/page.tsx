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

function ResumePreview({ data }: { data: ResumeData }) {
  const s: React.CSSProperties = {
    fontFamily: '"Times New Roman", Times, serif',
    fontSize: 11,
    lineHeight: 1.4,
    color: '#000',
    background: '#fff',
    padding: '24px 32px',
    width: '100%',
    minHeight: 1056, // A4 at 96dpi
    boxSizing: 'border-box',
  }

  const HR = () => <hr style={{ border: 'none', borderTop: '1px solid #000', margin: '4px 0 6px' }} />
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>{title}</div>
      <HR />
      {children}
    </div>
  )

  return (
    <div style={s}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>{data.name || 'Your Name'}</div>
        <div style={{ fontSize: 10, color: '#333', marginTop: 3 }}>
          {[data.email, data.phone, data.linkedin && `linkedin.com/in/${data.linkedin}`, data.github && `github.com/${data.github}`]
            .filter(Boolean).join(' | ')}
        </div>
      </div>

      {/* Education */}
      {data.education.some(e => e.institution) && (
        <Section title="Education">
          {data.education.filter(e => e.institution).map((e, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <div>
                <span style={{ fontWeight: 700 }}>{e.institution}</span>
                {e.degree && <span> — {e.degree}</span>}
                {e.score && <span style={{ color: '#555' }}> · {e.score}</span>}
              </div>
              <div style={{ color: '#555', flexShrink: 0 }}>{e.year}</div>
            </div>
          ))}
        </Section>
      )}

      {/* Skills */}
      {data.skills.some(s => s.items) && (
        <Section title="Technical Skills">
          {data.skills.filter(s => s.items).map((s, i) => (
            <div key={i} style={{ marginBottom: 3 }}>
              <span style={{ fontWeight: 700 }}>{s.category}: </span>
              <span>{s.items}</span>
            </div>
          ))}
        </Section>
      )}

      {/* Projects */}
      {data.projects.some(p => p.title) && (
        <Section title="Projects">
          {data.projects.filter(p => p.title).map((p, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700 }}>{p.title}</span>
                {p.tech && <span style={{ fontStyle: 'italic', color: '#555', fontSize: 10 }}>{p.tech}</span>}
              </div>
              <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>
                {p.bullets.filter(Boolean).map((b, j) => (
                  <li key={j} style={{ marginBottom: 1 }}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      )}

      {/* Certifications */}
      {data.certifications.some(Boolean) && (
        <Section title="Certifications">
          <ul style={{ margin: '0 0 0 16px', padding: 0 }}>
            {data.certifications.filter(Boolean).map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Languages */}
      {data.languages.some(Boolean) && (
        <Section title="Languages">
          <div>{data.languages.filter(Boolean).join(', ')}</div>
        </Section>
      )}

      {/* Declaration */}
      {data.declaration && (
        <Section title="Declaration">
          <div style={{ fontSize: 10, color: '#333' }}>
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
          <div>
            <div style={{
              background: '#fff',
              borderRadius: 8,
              overflow: 'hidden',
              boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
              position: 'sticky',
              top: 20,
            }}>
              <div style={{ background: '#1a1a2e', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#6060a0' }}>📄 Live Preview — A4</span>
                <button onClick={handlePrint} style={{ fontSize: 11, color: '#4A90D9', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  Export PDF ↗
                </button>
              </div>
              <div ref={printRef} style={{ transform: 'scale(0.72)', transformOrigin: 'top left', width: '139%', height: 760 }}>
                <ResumePreview data={resume} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
