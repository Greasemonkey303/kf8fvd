import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { query } from '../../../../lib/db'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

async function verifyTurnstileToken(token?: string) {
  // allow bypass via env var for troubleshooting
  const bypass = (process.env.CF_TURNSTILE_BYPASS || '').toLowerCase()
  if (bypass === '1' || bypass === 'true') return true

  const secret = process.env.CF_TURNSTILE_SECRET
  // if no secret configured, skip verification (dev convenience)
  if (!secret) return true
  if (!token) return false
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }) as any,
    })
    const j = await res.json()
    return !!j?.success
  } catch (e) {
    return false
  }
}

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        remember: { label: 'Remember', type: 'text' },
        cf_turnstile_response: { label: 'Turnstile', type: 'text' },
      },
      async authorize(credentials) {
        // if server-side Turnstile secret is configured, require and verify the token
        try {
          const token = (credentials as any)?.cf_turnstile_response || (credentials as any)?.['cf-turnstile-response'] || null
          if (process.env.CF_TURNSTILE_SECRET) {
            const ok = await verifyTurnstileToken(String(token || ''))
            if (!ok) return null
          }
        } catch (err) {
          return null
        }

        if (!credentials?.email || !credentials?.password) return null
        const rows = await query<{ id: number; name?: string; email: string; hashed_password?: string; is_active: number }[]>('SELECT id, name, email, hashed_password, is_active FROM users WHERE email = ? LIMIT 1', [credentials.email])
        const user = Array.isArray(rows) && rows.length ? rows[0] : null
        if (!user) return null
        if (!user.is_active) return null
        const valid = user.hashed_password ? bcrypt.compareSync(credentials.password, user.hashed_password) : false
        if (!valid) return null
        // include remember flag from credentials (client sends 'true' when checked)
        const remember = credentials?.remember === 'true' || credentials?.remember === 'on' || credentials?.remember === '1'
        return { id: String(user.id), name: user.name || '', email: user.email, remember }
      }
    })
  ],
  session: { strategy: 'jwt' },
  // custom JWT encode/decode so we can set per-login expiration when "remember" is used
  jwt: {
    encode: async ({ token, secret, maxAge }: { token: Record<string, unknown>; secret: string; maxAge?: number }) => {
      try {
        const now = Math.floor(Date.now() / 1000)
        const tkn = token as Record<string, unknown>
        const ttl = tkn?.remember ? 30 * 24 * 60 * 60 : (maxAge ?? 24 * 60 * 60)
        const payload = { ...(tkn as Record<string, unknown>), exp: now + ttl }
        return jwt.sign(payload as Record<string, unknown>, secret, { algorithm: 'HS256' })
      } catch (_e) { return '' }
    },
    decode: async ({ token, secret }: { token?: string; secret: string }) => {
      try {
        const decoded = jwt.verify(token || '', secret, { algorithms: ['HS256'] })
        return typeof decoded === 'object' ? (decoded as Record<string, unknown>) : null
      } catch (_e) {
        // fallback: try to parse legacy JSON token formats or decode without verification
        try {
          if (!token) return null
          const t = token as string
          if (t.startsWith('j:')) return JSON.parse(t.slice(2))
          const loose = jwt.decode(t)
          return typeof loose === 'object' ? (loose as Record<string, unknown>) : null
        } catch (_err) {
          return null
        }
      }
    }
  },
  callbacks: {
    async jwt({ token, user }: { token: Record<string, unknown>; user?: Record<string, unknown> }) {
      const tk = token as Record<string, unknown>
      if (user) {
        tk.user = user
        if ((user as Record<string, unknown>).remember) tk.remember = true
      }
      return tk
    },
    async session({ session, token }: { session: Record<string, unknown>; token: Record<string, unknown> }) {
      if ((token as Record<string, unknown>).user) (session as Record<string, unknown>).user = (token as Record<string, unknown>).user
      // expose remember flag to client if present
      if ((token as Record<string, unknown>).remember) (session as Record<string, unknown>).remember = true
      return session as unknown as Record<string, unknown>
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions as any)
export { handler as GET, handler as POST }
