// AI layer — Google Gemini (free tier)
// gemini-2.0-flash for scoring (fast + cheap)
// gemini-2.0-flash for tailoring (strong enough, free)

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

async function gemini(model: string, prompt: string): Promise<string> {
  const res = await fetch(
    `${BASE}/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
        },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

function parseJSON<T>(text: string, fallback: T): T {
  try {
    const match = text.match(/```json\s*([\s\S]*?)```/) ||
                  text.match(/\{[\s\S]*\}/) ||
                  text.match(/\[[\s\S]*\]/)
    const raw = match ? (match[1] ?? match[0]) : text
    return JSON.parse(raw.trim())
  } catch {
    return fallback
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MatchAnalysis {
  score: number          // 0-100
  matchedSkills: string[]
  missingSkills: string[]
  reasoning: string
  recommend: boolean
}

export interface TailoredResume {
  summary: string
  skills: string[]
  optimizedBullets: string[]
  matchedKeywords: string[]
  coverNote: string
}

// ─── Score match ─────────────────────────────────────────────────────────────

export async function scoreMatch(
  resumeText: string,
  jobTitle: string,
  jobDescription: string,
  experience: number
): Promise<MatchAnalysis> {
  const prompt = `You are a technical recruiter. Score how well this resume matches the job.

JOB TITLE: ${jobTitle}
JOB DESCRIPTION: ${jobDescription.slice(0, 1500)}

CANDIDATE RESUME (${experience} years exp):
${resumeText.slice(0, 2000)}

Return ONLY valid JSON (no markdown):
{
  "score": <0-100 integer>,
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1"],
  "reasoning": "<2 sentences>",
  "recommend": <true if score >= 60>
}`

  try {
    const text = await gemini('gemini-2.0-flash', prompt)
    const result = parseJSON<MatchAnalysis>(text, {
      score: 50, matchedSkills: [], missingSkills: [],
      reasoning: 'Could not parse AI response', recommend: false,
    })
    result.score = Math.max(0, Math.min(100, Number(result.score) || 50))
    result.recommend = result.score >= 60
    return result
  } catch {
    return { score: 50, matchedSkills: [], missingSkills: [], reasoning: 'AI scoring failed', recommend: false }
  }
}

// ─── Tailor resume ───────────────────────────────────────────────────────────

export async function tailorResume(params: {
  resumeText: string
  jobTitle: string
  jobDescription: string
  companyName: string
  matchedSkills: string[]
  missingSkills: string[]
}): Promise<TailoredResume> {
  const { resumeText, jobTitle, jobDescription, companyName, matchedSkills, missingSkills } = params

  const prompt = `You are a professional resume writer. Tailor this resume for the specific job.

JOB: ${jobTitle} at ${companyName}
DESCRIPTION: ${jobDescription.slice(0, 1500)}
MATCHED SKILLS: ${matchedSkills.join(', ')}
SKILLS TO HIGHLIGHT: ${missingSkills.join(', ')}

ORIGINAL RESUME:
${resumeText.slice(0, 2500)}

Return ONLY valid JSON (no markdown):
{
  "summary": "<2-3 sentence professional summary tailored to this role>",
  "skills": ["skill1", "skill2", "skill3"],
  "optimizedBullets": [
    "<achievement bullet point 1 with metrics>",
    "<achievement bullet point 2>",
    "<achievement bullet point 3>"
  ],
  "matchedKeywords": ["keyword1", "keyword2"],
  "coverNote": "<3-4 sentence cover note specifically for ${companyName} and this ${jobTitle} role>"
}`

  try {
    const text = await gemini('gemini-2.0-flash', prompt)
    const result = parseJSON<TailoredResume>(text, {
      summary: '', skills: [], optimizedBullets: [], matchedKeywords: [], coverNote: '',
    })
    return result
  } catch {
    return { summary: '', skills: [], optimizedBullets: [], matchedKeywords: [], coverNote: '' }
  }
}

// ─── Extract resume info ──────────────────────────────────────────────────────

export async function extractResumeInfo(resumeText: string): Promise<{
  name: string
  email: string
  phone: string
  experience: number
  skills: string[]
  currentRole: string
  education: string
  summary: string
}> {
  const prompt = `Extract structured information from this resume.

RESUME:
${resumeText.slice(0, 3000)}

Return ONLY valid JSON (no markdown):
{
  "name": "<full name>",
  "email": "<email>",
  "phone": "<phone>",
  "experience": <years as number>,
  "skills": ["skill1", "skill2"],
  "currentRole": "<current or most recent job title>",
  "education": "<highest degree and institution>",
  "summary": "<2 sentence professional summary>"
}`

  try {
    const text = await gemini('gemini-2.0-flash', prompt)
    return parseJSON(text, {
      name: '', email: '', phone: '', experience: 0,
      skills: [], currentRole: '', education: '', summary: '',
    })
  } catch {
    return { name: '', email: '', phone: '', experience: 0, skills: [], currentRole: '', education: '', summary: '' }
  }
}
