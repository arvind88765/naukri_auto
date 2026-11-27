/**
 * AI Resume Tailoring — using Claude API
 * Tailors resume per job JD using context from Naukri JD SDUI vars we extracted
 */

import Anthropic from '@anthropic-ai/sdk'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type TailoredResume = {
  summary: string
  skills: string[]
  optimizedBullets: string[]
  matchedKeywords: string[]
  coverNote: string
}

export type MatchAnalysis = {
  score: number          // 0-100
  matchedSkills: string[]
  missingSkills: string[]
  reasoning: string
  recommend: boolean     // should auto-apply
}

/**
 * Score how well a resume matches a job description
 * Uses claude-haiku for speed (called per-job in a loop)
 */
export async function scoreMatch(
  resumeText: string,
  jobTitle: string,
  jobDescription: string,
  candidateExperience: number
): Promise<MatchAnalysis> {
  const prompt = `You are an expert ATS (Applicant Tracking System) and recruiter.

JOB TITLE: ${jobTitle}
JOB DESCRIPTION:
${jobDescription.slice(0, 1500)}

CANDIDATE RESUME (summary):
${resumeText.slice(0, 1000)}
Experience: ${candidateExperience} years

Analyze the match. Return ONLY valid JSON, no markdown:
{
  "score": <0-100 integer>,
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill3"],
  "reasoning": "one sentence why",
  "recommend": <true if score >= 60>
}`

  try {
    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = (msg.content[0] as { type: string; text: string }).text.trim()
    // Strip markdown code blocks if present
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    return JSON.parse(jsonStr)
  } catch {
    // Fallback: keyword match scoring
    const jdLower = jobDescription.toLowerCase()
    const resumeLower = resumeText.toLowerCase()

    const keywords = jobTitle.toLowerCase().split(/\s+/)
    let hits = 0
    keywords.forEach(kw => { if (resumeLower.includes(kw)) hits++ })
    const score = Math.min(90, Math.round((hits / Math.max(keywords.length, 1)) * 70))

    return {
      score,
      matchedSkills: [],
      missingSkills: [],
      reasoning: 'Keyword-based fallback scoring',
      recommend: score >= 60,
    }
  }
}

/**
 * Tailor resume for a specific job using Claude
 * Uses jd_sdui_sample.json vars we extracted: jobTitle, companyName, etc.
 */
export async function tailorResume(params: {
  baseResume: string
  jobTitle: string
  companyName: string
  jobDescription: string
  candidateSkills?: string[]
  targetKeywords?: string[]
}): Promise<TailoredResume> {
  const { baseResume, jobTitle, companyName, jobDescription, candidateSkills = [] } = params

  const prompt = `You are an expert resume writer and ATS optimization specialist.

COMPANY: ${companyName}
JOB TITLE: ${jobTitle}

JOB DESCRIPTION:
${jobDescription.slice(0, 2000)}

CANDIDATE'S BASE RESUME:
${baseResume.slice(0, 2000)}

CANDIDATE'S SKILLS: ${candidateSkills.join(', ')}

Task: Tailor this resume for the specific job.
- Rewrite the professional summary (3-4 sentences max) highlighting most relevant experience
- Extract top 8-12 skills matching the JD
- Rewrite 4-6 achievement bullets using STAR format with numbers where possible
- Write a short cover note (2-3 sentences)
- Extract keywords from JD that match the resume

Return ONLY valid JSON, no markdown:
{
  "summary": "Professional summary text here...",
  "skills": ["Skill1", "Skill2", "Skill3"],
  "optimizedBullets": [
    "• Achievement with metric",
    "• Achievement with impact"
  ],
  "matchedKeywords": ["keyword1", "keyword2"],
  "coverNote": "I am excited to apply for the ${jobTitle} position at ${companyName}..."
}`

  try {
    const msg = await claude.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = (msg.content[0] as { type: string; text: string }).text.trim()
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    return JSON.parse(jsonStr)
  } catch {
    // Fallback: return base resume structure
    return {
      summary: `Experienced professional applying for ${jobTitle} at ${companyName}.`,
      skills: candidateSkills.slice(0, 10),
      optimizedBullets: ['• Extensive experience in relevant domain', '• Strong technical skills'],
      matchedKeywords: [],
      coverNote: `I am excited to apply for the ${jobTitle} position at ${companyName}.`,
    }
  }
}

/**
 * Extract resume text from raw paste/upload
 */
export async function extractResumeInfo(resumeText: string): Promise<{
  name?: string
  email?: string
  phone?: string
  experience?: number
  currentRole?: string
  skills: string[]
  summary?: string
}> {
  const prompt = `Extract information from this resume. Return ONLY valid JSON:
{
  "name": "...",
  "email": "...",
  "phone": "...",
  "experience": <years as number>,
  "currentRole": "...",
  "skills": ["skill1", "skill2"],
  "summary": "one paragraph professional summary"
}

RESUME:
${resumeText.slice(0, 3000)}`

  try {
    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = (msg.content[0] as { type: string; text: string }).text.trim()
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    return JSON.parse(jsonStr)
  } catch {
    return { skills: [] }
  }
}
