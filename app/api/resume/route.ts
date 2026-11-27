/**
 * GET /api/resume      — load user's structured resume JSON
 * PUT /api/resume      — save structured resume JSON + sync base_resume_text
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

/** Convert structured ResumeData → plain text for AI tailoring */
function resumeToText(r: Record<string, unknown>): string {
  const lines: string[] = []

  const name = r.name as string
  const email = r.email as string
  const phone = r.phone as string
  const linkedin = r.linkedin as string
  const github = r.github as string

  if (name) lines.push(name)
  const contact = [email, phone, linkedin && `linkedin.com/in/${linkedin}`, github && `github.com/${github}`].filter(Boolean)
  if (contact.length) lines.push(contact.join(' | '))
  lines.push('')

  const education = r.education as Array<{ institution: string; degree: string; year: string; score: string }>
  if (education?.length) {
    lines.push('EDUCATION')
    education.filter(e => e.institution).forEach(e => {
      lines.push(`${e.institution} — ${e.degree} ${e.score ? `· ${e.score}` : ''} ${e.year}`.trim())
    })
    lines.push('')
  }

  const skills = r.skills as Array<{ category: string; items: string }>
  if (skills?.some(s => s.items)) {
    lines.push('TECHNICAL SKILLS')
    skills.filter(s => s.items).forEach(s => lines.push(`${s.category}: ${s.items}`))
    lines.push('')
  }

  const projects = r.projects as Array<{ title: string; tech: string; bullets: string[] }>
  if (projects?.some(p => p.title)) {
    lines.push('PROJECTS')
    projects.filter(p => p.title).forEach(p => {
      lines.push(`${p.title}${p.tech ? ` | ${p.tech}` : ''}`)
      p.bullets.filter(Boolean).forEach(b => lines.push(`  • ${b}`))
    })
    lines.push('')
  }

  const certs = r.certifications as string[]
  if (certs?.some(Boolean)) {
    lines.push('CERTIFICATIONS')
    certs.filter(Boolean).forEach(c => lines.push(`• ${c}`))
    lines.push('')
  }

  const langs = r.languages as string[]
  if (langs?.some(Boolean)) {
    lines.push(`Languages: ${langs.filter(Boolean).join(', ')}`)
  }

  return lines.join('\n').trim()
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('resume_structured, base_resume_text')
    .eq('email', session.user.email)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  return NextResponse.json({
    resume: user.resume_structured || null,
    hasResume: !!(user.resume_structured || user.base_resume_text),
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { resume } = await req.json()
  if (!resume) return NextResponse.json({ error: 'No resume data' }, { status: 400 })

  // Convert structured resume to plain text for AI tailoring engine
  const plainText = resumeToText(resume as Record<string, unknown>)

  const { error } = await supabaseAdmin
    .from('users')
    .update({
      resume_structured: resume,
      base_resume_text: plainText,
      resume_updated_at: new Date().toISOString(),
    })
    .eq('email', session.user.email)

  if (error) {
    return NextResponse.json({ error: 'Save failed', details: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
