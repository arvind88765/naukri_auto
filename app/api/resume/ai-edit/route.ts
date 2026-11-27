/**
 * POST /api/resume/ai-edit
 * AI-powered resume editing — tweaks the structured resume JSON
 * based on user's natural language instruction + optional target job
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

async function gemini(prompt: string): Promise<string> {
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
    }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

function parseJSON<T>(text: string, fallback: T): T {
  try {
    const match = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/)
    const raw = match ? (match[1] ?? match[0]) : text
    return JSON.parse(raw.trim())
  } catch {
    return fallback
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { resume, prompt, targetJob } = await req.json()
  if (!resume || !prompt) {
    return NextResponse.json({ error: 'Missing resume or prompt' }, { status: 400 })
  }

  const systemPrompt = `You are an expert resume editor specializing in 1-page resumes for freshers (new graduates with 0-2 years experience).

CURRENT RESUME (JSON):
${JSON.stringify(resume, null, 2)}

USER'S EDIT INSTRUCTION: "${prompt}"
${targetJob ? `TARGET JOB: ${targetJob}` : ''}

RULES:
1. Keep the resume to 1 PAGE MAXIMUM — be ruthless about cutting fluff
2. Keep everything factual — do NOT invent experience, jobs, or degrees
3. Bullet points should use strong action verbs and quantify achievements where possible
4. Skills section should be keyword-rich for ATS systems
5. Project descriptions should highlight impact, not just what was done
6. If targeting a specific job, emphasize relevant skills/projects

Return ONLY valid JSON in exactly this structure (same fields as input, all fields required):
{
  "name": string,
  "email": string,
  "phone": string,
  "linkedin": string,
  "github": string,
  "education": [{"institution": string, "degree": string, "year": string, "score": string}],
  "skills": [{"category": string, "items": string}],
  "projects": [{"title": string, "tech": string, "bullets": string[]}],
  "certifications": string[],
  "languages": string[],
  "declaration": boolean
}

Apply the edit instruction while keeping all other fields intact. Only change what's needed.`

  try {
    const raw = await gemini(systemPrompt)
    const edited = parseJSON(raw, resume)
    return NextResponse.json({ success: true, resume: edited, raw: raw.slice(0, 200) })
  } catch (err) {
    return NextResponse.json({
      error: 'AI edit failed',
      details: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}
