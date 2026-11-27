'use client'

import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function LandingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') {
      const user = session?.user as { onboardingCompleted?: boolean; naukriConnected?: boolean } | undefined
      if (user?.onboardingCompleted && user?.naukriConnected) {
        router.push('/dashboard')
      } else {
        router.push('/onboard')
      }
    }
  }, [status, session, router])

  const handleGoogleLogin = async () => {
    setLoading(true)
    await signIn('google', { callbackUrl: '/onboard' })
  }

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    )
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #0d1117 50%, #0a0f1a 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background glow orbs */}
      <div style={{
        position: 'absolute', top: '20%', left: '10%',
        width: 400, height: 400,
        background: 'radial-gradient(circle, rgba(74,144,217,0.08) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '20%', right: '10%',
        width: 300, height: 300,
        background: 'radial-gradient(circle, rgba(6,214,160,0.06) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none',
      }} />

      {/* Hero */}
      <div style={{ maxWidth: 560, width: '100%', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(74,144,217,0.1)', border: '1px solid rgba(74,144,217,0.3)',
          borderRadius: 20, padding: '6px 16px', marginBottom: 32,
        }}>
          <div className="pulse-dot" />
          <span style={{ fontSize: 13, color: '#4A90D9', fontWeight: 600 }}>Powered by Claude AI</span>
        </div>

        <h1 style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.1, marginBottom: 20, letterSpacing: -1 }}>
          Apply to 100+ jobs{' '}
          <span style={{ color: '#4A90D9' }} className="glow">while you sleep</span>
        </h1>

        <p style={{ fontSize: 18, color: '#9090aa', lineHeight: 1.6, marginBottom: 48 }}>
          Connect your Naukri account. Upload your resume once.
          Our AI tailors and auto-applies to matching jobs — every single day.
        </p>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 48 }}>
          {[
            { n: '100+', label: 'Jobs / Day' },
            { n: 'AI', label: 'Resume Tailoring' },
            { n: '24/7', label: 'Auto-Apply' },
          ].map(stat => (
            <div key={stat.label} style={{
              background: 'rgba(26,26,40,0.8)', border: '1px solid #2a2a3a',
              borderRadius: 10, padding: '16px 12px',
            }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#4A90D9' }}>{stat.n}</div>
              <div style={{ fontSize: 12, color: '#9090aa', marginTop: 4 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            background: 'white', color: '#1a1a1a', border: 'none',
            borderRadius: 10, padding: '16px 32px', fontSize: 16, fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            width: '100%', maxWidth: 400, margin: '0 auto',
            transition: 'all 0.2s', boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            opacity: loading ? 0.7 : 1,
          }}
          onMouseEnter={e => { if (!loading) (e.target as HTMLButtonElement).style.transform = 'translateY(-2px)' }}
          onMouseLeave={e => { (e.target as HTMLButtonElement).style.transform = 'translateY(0)' }}
        >
          {loading ? (
            <div className="spinner" style={{ borderTopColor: '#4A90D9' }} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          {loading ? 'Signing in...' : 'Continue with Google — it\'s free'}
        </button>

        <p style={{ fontSize: 13, color: '#6060788', marginTop: 16 }}>
          No credit card required · Your data stays private · You control the apply speed
        </p>

        {/* How it works */}
        <div style={{ marginTop: 64, textAlign: 'left' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 32, color: '#c0c0d8' }}>
            How it works
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[
              { step: '01', title: 'Sign in with Google', desc: 'One click. No passwords.' },
              { step: '02', title: 'Connect Naukri + upload resume', desc: 'Enter your Naukri creds and paste your resume. We store it encrypted.' },
              { step: '03', title: 'Tell us what you want', desc: 'Target role, location, salary range, WFH preference — takes 2 minutes.' },
              { step: '04', title: 'AI applies for you', desc: 'Claude scores each job, tailors your resume, writes a cover note, applies — repeat.' },
            ].map(item => (
              <div key={item.step} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{
                  width: 36, height: 36, background: 'rgba(74,144,217,0.1)', border: '1px solid rgba(74,144,217,0.3)',
                  borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#4A90D9', flexShrink: 0,
                }}>{item.step}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{item.title}</div>
                  <div style={{ fontSize: 14, color: '#9090aa' }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
