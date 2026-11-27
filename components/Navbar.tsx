'use client'

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Navbar() {
  const { data: session } = useSession()
  const pathname = usePathname()

  if (!session) return null

  const links = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/jobs', label: 'Jobs' },
  ]

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(13,17,23,0.95)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid #1a1a2e', padding: '0 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 60,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
        <Link href="/dashboard" style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#4A90D9' }}>
            Naukri<span style={{ color: '#fff' }}>Auto</span>
          </span>
        </Link>
        <div style={{ display: 'flex', gap: 8 }}>
          {links.map(link => (
            <Link key={link.href} href={link.href} style={{
              textDecoration: 'none',
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              color: pathname === link.href ? '#4A90D9' : '#9090aa',
              background: pathname === link.href ? 'rgba(74,144,217,0.1)' : 'transparent',
              transition: 'all 0.15s',
            }}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {session.user?.image && (
            <img src={session.user.image} alt="" style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '2px solid #2a2a3a',
            }} />
          )}
          <span style={{ fontSize: 14, color: '#c0c0d8' }}>
            {session.user?.name?.split(' ')[0]}
          </span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          style={{
            background: 'transparent', border: '1px solid #2a2a3a',
            borderRadius: 8, padding: '6px 14px', fontSize: 13,
            color: '#9090aa', cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            (e.target as HTMLButtonElement).style.borderColor = '#4A90D9'
            ;(e.target as HTMLButtonElement).style.color = '#4A90D9'
          }}
          onMouseLeave={e => {
            (e.target as HTMLButtonElement).style.borderColor = '#2a2a3a'
            ;(e.target as HTMLButtonElement).style.color = '#9090aa'
          }}
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
