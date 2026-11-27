import NextAuth from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      googleId?: string
      naukriConnected?: boolean
      onboardingCompleted?: boolean
      autoApplyEnabled?: boolean
    }
    googleAccessToken?: string
  }

  interface User {
    id: string
    googleId?: string
    naukriConnected?: boolean
    onboardingCompleted?: boolean
    autoApplyEnabled?: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    googleId?: string
    googleAccessToken?: string
    naukriConnected?: boolean
    onboardingCompleted?: boolean
    autoApplyEnabled?: boolean
  }
}
