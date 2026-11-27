import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { supabaseAdmin } from '@/lib/supabase'

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
          scope: 'openid email profile',
        },
      },
    }),
  ],

  secret: process.env.NEXTAUTH_SECRET,

  pages: {
    signIn: '/',
    error: '/',
  },

  callbacks: {
    async signIn({ user, account }) {
      if (!user.email || account?.provider !== 'google') return false

      try {
        // Upsert user in Supabase
        const { error } = await supabaseAdmin
          .from('users')
          .upsert({
            google_id: user.id,
            email: user.email,
            name: user.name,
            avatar_url: user.image,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'google_id',
            ignoreDuplicates: false,
          })

        if (error) {
          console.error('[Auth] Supabase upsert error:', error)
          return false
        }

        return true
      } catch (err) {
        console.error('[Auth] signIn error:', err)
        return false
      }
    },

    async session({ session, token }) {
      if (session.user && token.sub) {
        // Attach internal DB user id and onboarding status to session
        const { data: user } = await supabaseAdmin
          .from('users')
          .select('id, naukri_user_id, naukri_cv_id, onboarding_completed, auto_apply_enabled, naukri_connected_at')
          .eq('google_id', token.sub)
          .single()

        if (user) {
          session.user.id = user.id
          session.user.googleId = token.sub
          session.user.naukriConnected = !!user.naukri_user_id
          session.user.onboardingCompleted = user.onboarding_completed
          session.user.autoApplyEnabled = user.auto_apply_enabled
        }
      }
      return session
    },

    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
  },
})

export { handler as GET, handler as POST }
