import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { query } from '../../../../lib/db'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        remember: { label: 'Remember', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const rows: any = await query('SELECT id, name, email, hashed_password, is_active FROM users WHERE email = ? LIMIT 1', [credentials.email])
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
    encode: async ({ token, secret, maxAge }) => {
      try {
        const now = Math.floor(Date.now() / 1000)
        const ttl = token?.remember ? 30 * 24 * 60 * 60 : (maxAge ?? 24 * 60 * 60)
        const payload = { ...token, exp: now + ttl }
        return jwt.sign(payload, secret, { algorithm: 'HS256' })
      } catch (e) { return '' }
    },
    decode: async ({ token, secret }) => {
      try {
        const decoded = jwt.verify(token || '', secret, { algorithms: ['HS256'] })
        return typeof decoded === 'object' ? decoded as any : null
      } catch (e) {
        // fallback: try to parse legacy JSON token formats or decode without verification
        try {
          if (!token) return null
          const t = token as string
          if (t.startsWith('j:')) return JSON.parse(t.slice(2))
          const loose = jwt.decode(t) as any
          return typeof loose === 'object' ? loose : null
        } catch (err) {
          return null
        }
      }
    }
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.user = user
        if ((user as any).remember) token.remember = true
      }
      return token
    },
    async session({ session, token }) {
      if (token.user) session.user = token.user as any
      // expose remember flag to client if present
      if ((token as any).remember) (session as any).remember = true
      return session
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions as any)
export { handler as GET, handler as POST }
