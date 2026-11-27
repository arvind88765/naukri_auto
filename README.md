# NaukriAuto 🤖

Auto-apply to 100+ Naukri jobs per day using AI. Claude tailors your resume per job, scores matches, and applies — while you sleep.

Built from reverse engineering Naukri APK v22.3.

---

## Stack

- **Next.js 14** (App Router)
- **NextAuth.js v4** (Google OAuth)
- **Supabase** (Postgres DB + RLS)
- **Anthropic Claude** (claude-haiku for scoring, claude-sonnet for resume tailoring)
- **AES-256-GCM** (Node.js built-in crypto — no extra deps)
- **Tailwind CSS** (dark theme)

---

## Setup

### 1. Clone & install

```bash
cd naukriauto
npm install
```

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run `/supabase/schema.sql` — creates all tables + RLS
3. Grab your keys from **Settings → API**:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role secret → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Google OAuth

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create OAuth 2.0 Client ID (Web application)
3. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
4. Copy Client ID → `GOOGLE_CLIENT_ID`
5. Copy Client Secret → `GOOGLE_CLIENT_SECRET`

### 4. Anthropic API

Get your key from [console.anthropic.com](https://console.anthropic.com)
→ `ANTHROPIC_API_KEY`

### 5. Environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# NextAuth
NEXTAUTH_SECRET=run: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Encryption key for Naukri credentials (MUST be 64 hex chars = 32 bytes)
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your_64_char_hex_string
```

### 6. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## How it works

```
User signs in with Google
        ↓
Connect Naukri account (creds stored AES-256 encrypted)
        ↓
5-question onboarding (role, exp, location, salary, WFH)
        ↓
Paste resume text
        ↓
Hit "Run Now" (or enable Auto-Apply for hourly runs)
        ↓
Engine loop:
  1. Search Naukri for matching jobs (multiple locations)
  2. Deduplicate by job ID
  3. For each job:
     a. Claude Haiku scores match (0-100)
     b. Skip if score < minScore (default 60)
     c. Claude Sonnet tailors resume keywords + cover note
     d. Apply via Naukri API (from APK RE)
     e. Rate limit: 3s between applies
  4. Update DB with status at each step
  5. Log to sync_logs
```

---

## Project structure

```
naukriauto/
├── app/
│   ├── page.tsx                 # Landing page
│   ├── onboard/page.tsx         # 3-step onboarding
│   ├── dashboard/page.tsx       # Main dashboard + engine control
│   ├── jobs/page.tsx            # Job queue monitor
│   ├── layout.tsx               # Root layout (SessionProvider)
│   ├── globals.css              # Dark theme + utility classes
│   └── api/
│       ├── auth/[...nextauth]/  # Google OAuth handler
│       ├── naukri/
│       │   ├── login/           # Connect Naukri account
│       │   ├── profile/         # Get/update profile + preferences
│       │   └── jobs/apply/      # Trigger engine + get queue
│       └── ai/tailor/           # On-demand tailoring + resume extract
├── components/
│   ├── Navbar.tsx
│   ├── JobCard.tsx
│   └── SessionProvider.tsx
├── lib/
│   ├── naukri-client.ts         # Naukri API client (from APK RE)
│   ├── auto-apply-engine.ts     # Main apply loop
│   ├── resume-ai.ts             # Claude integration
│   ├── encryption.ts            # AES-256-GCM
│   └── supabase.ts              # DB clients
├── supabase/schema.sql          # Full DB schema
├── types/next-auth.d.ts         # Session type augmentation
└── .env.example
```

---

## Naukri API (from APK RE)

All endpoints hit `https://www.nma.mobi`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `central-login-services/v0/port-login` | POST | Login, get token |
| `cloudgateway-mynaukri/resman-aggregator-services/v0/users/self` | GET | Profile |
| `cloudgateway-mynaukri/resman-aggregator-services/v0/uniqueId` | GET | CV ID |
| `cloudgateway-apply/job-apply-services/v0/jobs/{id}/apply` | POST | Apply |
| `cloudgateway-apply/profile-performance/v0/jobseeker/self/search-impressions` | GET | Impressions |

Auth headers on every request:
```
Authorization: Bearer <token>
X-Naukri-User-Id: <userId>
appid: applicationservice
systemid: Naukri
User-Agent: NaukriApp/22.3 (Android; arm64-v8a)
```

---

## Deployment (Vercel)

```bash
npm i -g vercel
vercel
```

Add all env vars in Vercel dashboard → Settings → Environment Variables.

For production, update `NEXTAUTH_URL` to your deployed URL and add it to Google OAuth authorized redirects.

---

## Notes

- **Daily limit**: 50 applies/day by default (configurable in Supabase `users.daily_apply_limit`)
- **Rate limit**: 3s between applies to avoid Naukri blocking
- **Score threshold**: Jobs scoring below `minScore` (default 60/100) are skipped
- **Token refresh**: If Naukri token expires, engine auto-relogins using stored encrypted credentials
- **Duplicate prevention**: DB unique constraint on `(user_id, job_id)` — never double-applies

---

*Built with reverse engineered Naukri APK v22.3 endpoints.*
