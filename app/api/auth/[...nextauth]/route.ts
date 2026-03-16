import NextAuth from 'next-auth'
import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { query } from '../../../../lib/db'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { isLocked, incrementFailure, resetKey } from '@/lib/rateLimiter'

const isProd = process.env.NODE_ENV === 'production'
if (isProd && !process.env.NEXTAUTH_SECRET) {
  // Fail fast in production when NEXTAUTH_SECRET is missing
  console.error('NEXTAUTH_SECRET is required in production for NextAuth')
  throw new Error('NEXTAUTH_SECRET is required in production')
}

async function verifyTurnstileToken(token?: string) {
  // allow bypass via env var for troubleshooting
  const bypass = (process.env.CF_TURNSTILE_BYPASS || '').toLowerCase()
  // Only allow bypass in non-production environments for troubleshooting
  if ((bypass === '1' || bypass === 'true') && process.env.NODE_ENV !== 'production') return true

  const secret = process.env.CF_TURNSTILE_SECRET
  // if no secret configured, skip verification (dev convenience)
  if (!secret) return true
  if (!token) return false
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    })
    const j = await res.json()
    return !!j?.success
  } catch (e) {
    void e
    return false
  }
}

function extractIpFromReq(req: unknown): string {
  try {
    if (!req) return 'unknown'
    // headers can be a Web Headers object or a plain record
    const hdrs = (req as unknown as { headers?: Headers | Record<string, unknown> })?.headers
    if (hdrs) {
      if (typeof (hdrs as Headers).get === 'function') {
        const v = (hdrs as Headers).get('x-forwarded-for') || (hdrs as Headers).get('x-real-ip') || (hdrs as Headers).get('x-forwarded') || (hdrs as Headers).get('x-realip')
        if (v) return String(v).split(',')[0]
      }
      if (typeof hdrs === 'object' && hdrs !== null) {
        const v = (hdrs as Record<string, unknown>)['x-forwarded-for'] || (hdrs as Record<string, unknown>)['x-real-ip'] || (hdrs as Record<string, unknown>)['x-forwarded'] || (hdrs as Record<string, unknown>)['x-realip']
        if (v) return String(v).split(',')[0]
      }
    }
    // fallback: req itself might have header-like keys
    const maybe = (req as Record<string, unknown>)['x-forwarded-for'] || (req as Record<string, unknown>)['x-real-ip']
    if (maybe) return String(maybe).split(',')[0]
  } catch (e) { void e }
  return 'unknown'
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        remember: { label: 'Remember', type: 'text' },
        otp: { label: 'OTP', type: 'text' },
        cf_turnstile_response: { label: 'Turnstile', type: 'text' },
      },
      async authorize(credentials, req) {
        const creds = (credentials ?? {}) as Record<string, string | undefined>
        try {
          console.log('[auth] authorize called for', { email: creds.email ? String(creds.email) : null, hasOtp: !!creds.otp })
        } catch (e) { void e }
        // If a server-side Turnstile secret is configured and the client provided a token, verify it.
        // We only verify when a token is present so that the separate 2FA request flow (which verifies Turnstile)
        // can complete the authentication without requiring a fresh token on the final OTP submit.
        try {
          const token = creds.cf_turnstile_response || creds['cf-turnstile-response'] || null
          if (process.env.CF_TURNSTILE_SECRET && token) {
            const ok = await verifyTurnstileToken(String(token || ''))
            if (!ok) return null
          }
        } catch (err) {
          void err
          return null
        }

        if (!creds.email || !creds.password) return null
        const email = String(creds.email).trim().toLowerCase()
        const emailKey = `email:${email}`
        // derive IP from the incoming request when available (NextAuth passes `req`)
        const ip = extractIpFromReq(req)
        const ipKey = `ip:${ip}`
        if (await isLocked(emailKey) || await isLocked(ipKey)) return null
        const rows = await query<{ id: number; name?: string; email: string; hashed_password?: string; is_active: number }[]>('SELECT id, name, email, hashed_password, is_active FROM users WHERE email = ? LIMIT 1', [email])
        const user = Array.isArray(rows) && rows.length ? rows[0] : null
        if (!user) return null
        if (!user.is_active) return null
        const valid = user.hashed_password ? bcrypt.compareSync(String(creds.password), String(user.hashed_password)) : false
        if (!valid) {
          try { await incrementFailure(emailKey, { reason: 'invalid_password' }) } catch (e) { void e }
          try { await incrementFailure(ipKey, { reason: 'invalid_password' }) } catch (e) { void e }
          return null
        }
        // reset failures on successful password verify
        try { resetKey(emailKey) } catch (e) { void e }
        try { resetKey(ipKey) } catch (e) { void e }

        // If an OTP was included, validate it and complete sign-in. Otherwise, require the separate
        // 2FA request flow to send/verify the code.
        const otp = creds.otp
        if (otp) {
          // Ensure table exists (best-effort)
          try {
            await query('CREATE TABLE IF NOT EXISTS two_factor_codes (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT, email VARCHAR(255), code_hash VARCHAR(255), expires_at DATETIME, used_at DATETIME DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, INDEX (user_id), INDEX (email))')
          } catch (e) { void e /* ignore create table errors */ }

          const codes = await query<Record<string, unknown>[]>('SELECT id, code_hash FROM two_factor_codes WHERE user_id = ? AND used_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1', [user.id])
          const codeRow = Array.isArray(codes) && codes.length ? codes[0] : null
          try { console.log('[auth] verifying otp for user', user.id, { foundCode: !!codeRow }) } catch (e) { void e }
          if (!codeRow) return null
          const ok = bcrypt.compareSync(String(otp), String(codeRow.code_hash))
          try { console.log('[auth] otp compare result', !!ok) } catch (e) { void e }
          if (!ok) {
            try { await incrementFailure(emailKey, { reason: 'invalid_otp' }) } catch (e) { void e }
            try { await incrementFailure(ipKey, { reason: 'invalid_otp' }) } catch (e) { void e }
            return null
          }
          try { await query('UPDATE two_factor_codes SET used_at = NOW() WHERE id = ?', [codeRow.id]) } catch (e) { void e }

          const remember = creds.remember === 'true' || creds.remember === 'on' || creds.remember === '1'
          return { id: String(user.id), name: user.name || '', email: user.email, remember }
        }

        // If no OTP provided, do not allow sign-in from this authorize call. The client should first
        // call the 2FA request endpoint which sends the code to the user's email, then submit the OTP
        // in a follow-up signIn('credentials') call.
        return null
      }
    })
  ],
  session: { strategy: 'jwt', maxAge: 24 * 60 * 60 },
  // custom JWT encode/decode so we can set per-login expiration when "remember" is used
  jwt: {
    encode: async ({ token, secret, maxAge }) => {
      try {
          const now = Math.floor(Date.now() / 1000)
          const tkn = token as Record<string, unknown>
          const ttl = tkn?.remember ? 30 * 24 * 60 * 60 : (maxAge ?? 24 * 60 * 60)
          const payload = { ...(tkn as Record<string, unknown>), exp: now + ttl }
          return jwt.sign(payload as Record<string, unknown>, secret, { algorithm: 'HS256' })
        } catch (e) { void e; return '' }
    },
    decode: async ({ token, secret }) => {
      try {
        const decoded = jwt.verify(token || '', secret, { algorithms: ['HS256'] })
        return typeof decoded === 'object' ? (decoded as Record<string, unknown>) : null
      } catch (e) { void e; return null }
    }
  },
  // Secure cookie settings: use __Secure- prefix and secure cookies in production
  cookies: {
    sessionToken: {
      name: isProd ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: isProd }
    },
    csrfToken: {
      name: isProd ? '__Secure-next-auth.csrf-token' : 'next-auth.csrf-token',
      options: { httpOnly: true, path: '/', secure: isProd }
    },
    callbackUrl: {
      name: isProd ? '__Secure-next-auth.callback-url' : 'next-auth.callback-url',
      options: { httpOnly: false, path: '/', secure: isProd }
    },
    pkceCodeVerifier: {
      name: isProd ? '__Secure-next-auth.pkce.code_verifier' : 'next-auth.pkce.code_verifier',
      options: { httpOnly: true, path: '/', secure: isProd }
    }
  },
  callbacks: {
    async jwt({ token, user }) {
      const tk = token as Record<string, unknown>
      if (user) {
        tk.user = user as unknown as Record<string, unknown>
        if ((user as unknown as Record<string, unknown>).remember) tk.remember = true
      }
      return tk
    },
    async session({ session, token }) {
      if ((token as Record<string, unknown>).user) (session as unknown as Record<string, unknown>).user = (token as Record<string, unknown>).user
        // expose remember flag to client if present
        if ((token as Record<string, unknown>).remember) (session as unknown as Record<string, unknown>).remember = true
      return session
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
