import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Try models in order — 3.8-flash is current, 3.5-flash-lite is fallback
const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
]
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { text } = await request.json()
  if (!text || text.trim().length < 50) {
    return NextResponse.json({ error: 'Resume text too short' }, { status: 400 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 500 })
  }

  const prompt = `You are a resume parser. Extract structured data from the resume text below.

Return ONLY valid JSON matching this exact schema (no markdown, no explanation):

{
  "name": "string",
  "email": "string",
  "phone": "string",
  "linkedin": "string (URL or empty string)",
  "github": "string (URL or empty string)",
  "summary": "string (professional summary, 2-3 sentences max, or empty string)",
  "education": [
    {
      "degree": "string",
      "institution": "string",
      "year": "string (e.g. 2021-2025)",
      "cgpa": "string (e.g. 8.5 CGPA or empty string)"
    }
  ],
  "skills": [
    {
      "category": "string (e.g. Languages, Frameworks, Tools)",
      "items": ["string", "string"]
    }
  ],
  "experience": [
    {
      "role": "string",
      "company": "string",
      "duration": "string (e.g. Jan 2024 – Present)",
      "points": ["string (action verb bullet point)", "string"]
    }
  ],
  "projects": [
    {
      "name": "string",
      "tech": "string (comma-separated technologies)",
      "points": ["string (action verb bullet point)", "string"]
    }
  ],
  "certifications": ["string"],
  "languages": ["string"],
  "declaration": "string (declaration text or empty string)"
}

Rules:
- If a field is missing from the resume, use empty string or empty array
- For skills, group intelligently into 2-4 categories max (e.g. Languages, Frameworks, Tools, Databases)
- Keep bullet points concise and starting with action verbs
- Do not invent or fabricate any information not present in the resume
- Extract ALL experience entries if present
- Phone: include country code if present

RESUME TEXT:
${text.slice(0, 8000)}`

  try {
    // Try each model in order until one works
    let data: Record<string, unknown> | null = null
    let lastErr = ''
    for (const model of GEMINI_MODELS) {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        }),
      })
      if (res.ok) {
        data = await res.json()
        console.log(`[Gemini] using model: ${model}`)
        break
      }
      const errText = await res.text()
      console.error(`[Gemini] ${model} failed (${res.status}):`, errText.slice(0, 200))
      lastErr = errText
      // Only fall through on 404/503 — stop on auth errors
      if (res.status === 401 || res.status === 400) break
    }

    if (!data) {
      console.error('All Gemini models failed. Last error:', lastErr)
      return NextResponse.json({ error: 'AI unavailable — try again in a moment' }, { status: 500 })
    }

    const raw = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
      ?.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Strip markdown code blocks if present
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

    let resume
    try {
      resume = JSON.parse(cleaned)
    } catch {
      console.error('JSON parse failed:', cleaned.slice(0, 500))
      return NextResponse.json({ error: 'AI returned invalid data — try again' }, { status: 500 })
    }

    // Validate minimal structure
    if (!resume || typeof resume !== 'object') {
      return NextResponse.json({ error: 'Unexpected AI response format' }, { status: 500 })
    }

    // Ensure arrays exist
    resume.education = Array.isArray(resume.education) ? resume.education : []
    resume.skills = Array.isArray(resume.skills) ? resume.skills : []
    resume.experience = Array.isArray(resume.experience) ? resume.experience : []
    resume.projects = Array.isArray(resume.projects) ? resume.projects : []
    resume.certifications = Array.isArray(resume.certifications) ? resume.certifications : []
    resume.languages = Array.isArray(resume.languages) ? resume.languages : []

    // Ensure string fields
    resume.name = resume.name || ''
    resume.email = resume.email || ''
    resume.phone = resume.phone || ''
    resume.linkedin = resume.linkedin || ''
    resume.github = resume.github || ''
    resume.summary = resume.summary || ''
    resume.declaration = resume.declaration || ''

    return NextResponse.json({ resume })
  } catch (err) {
    console.error('Import route error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
