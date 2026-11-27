import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  const session = await getServerSession(authOptions)
  const s = session as any
  return NextResponse.json({
    hasSession: !!session,
    hasGoogleToken: !!s?.googleAccessToken,
    tokenPreview: s?.googleAccessToken ? s.googleAccessToken.slice(0, 25) + '...' : null,
    user: session?.user?.email,
  })
}
