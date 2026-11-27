/**
 * POST /api/ai/tailor
 * On-demand resume tailoring for a specific job
 *
 * POST /api/ai/extract-resume
 * Extract info from pasted resume text
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { tailorResume, extractResumeInfo, scoreMatch } from '@/lib/resume-ai'
import { z } from 'zod'

const TailorSchema = z.object({
  jobId: z.string().optional(),
  jobTitle: z.string().min(2),
  companyName: z.string().min(1),
  jobDescription: z.string().min(10),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const url = new URL(req.url)
  const isExtract = url.searchParams.get('action') === 'extract'

  if (isExtract) {
    // Extract info from pasted resume
    const { resumeText } = await req.json()
    if (!resumeText || resumeText.length < 50) {
      return NextResponse.json({ error: 'Resume text too short' }, { status: 400 })
    }

    const info = await extractResumeInfo(resumeText)
    return NextResponse.json({ success: true, info })
  }

  // Tailor resume for specific job
  let body
  try {
    body = TailorSchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: String(err) }, { status: 400 })
  }

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, base_resume_text, preferences')
    .eq('email', session.user.email)
    .single()

  if (!user?.base_resume_text) {
    return NextResponse.json({ error: 'No resume found — please upload your resume first' }, { status: 400 })
  }

  const [tailored, matchAnalysis] = await Promise.all([
    tailorResume({
      resumeText: user.base_resume_text,
      jobTitle: body.jobTitle,
      companyName: body.companyName,
      jobDescription: body.jobDescription,
      matchedSkills: user.preferences?.skills ?? [],
      missingSkills: [],
    }),
    scoreMatch(
      user.base_resume_text,
      body.jobTitle,
      body.jobDescription,
      user.preferences?.experience || 0
    ),
  ])

  // Update queue item if jobId provided
  if (body.jobId) {
    await supabaseAdmin.from('apply_queue')
      .update({ tailored_resume: tailored, match_score: matchAnalysis.score })
      .eq('user_id', user.id)
      .eq('job_id', body.jobId)
  }

  return NextResponse.json({
    success: true,
    tailored,
    match: matchAnalysis,
  })
}
