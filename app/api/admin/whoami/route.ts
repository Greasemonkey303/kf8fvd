import { NextResponse, NextRequest } from 'next/server'
import { isAdminEmail, getSessionServer, getAdminUserByEmail } from '@/lib/auth'
import jwt from 'jsonwebtoken'

type SessionTokenUser = {
  email?: string
  name?: string
}

type SessionTokenPayload = Record<string, unknown> & {
  email?: string
  name?: string
  user?: SessionTokenUser
}

export async function GET(req: NextRequest) {
  try {
    // Fallback: decode JWT directly from the session cookie if getToken doesn't
    // return a usable token in this runtime. This keeps the whoami check robust
    // across different Next.js/Edge runtimes and reverse-proxy setups.
    let token: SessionTokenPayload | null = null
    try {
      const cookies = String(req.headers.get('cookie') || '')
      const m = cookies.match(/(?:__Secure-next-auth.session-token|next-auth.session-token)=([^;\s]+)/)
      if (m && m[1]) {
        try {
          const decoded = jwt.verify(m[1], String(process.env.NEXTAUTH_SECRET || ''))
          if (decoded && typeof decoded === 'object') token = decoded as SessionTokenPayload
        } catch (e) { void e }
      }
    } catch (e) { void e }
    let user = null
    let admin = false
    // Prefer server-side session helper when available
    try {
      const s = await getSessionServer()
      if (s && typeof s === 'object' && (s as Record<string, unknown>).user) {
        const u = (s as Record<string, unknown>).user as Record<string, unknown>
        if (u?.email && typeof u.email === 'string') {
          const adminUser = await getAdminUserByEmail(String(u.email))
          user = adminUser ? { email: adminUser.email, name: adminUser.name } : { email: u.email, name: typeof u.name === 'string' ? u.name : undefined }
          admin = !!adminUser
          return NextResponse.json({ admin: !!admin, user })
        }
      }
    } catch (e) { void e }

    if (token && typeof token === 'object') {
      // Support tokens that embed the user object (e.g. `token.user.email`) as
      // well as tokens that expose `email`/`name` at the top level. This makes
      // server-side `whoami` resilient to the custom JWT encode/decode used by
      // this app where the user object is stored under `token.user`.
      const maybeUser = token.user
      const email = typeof token.email === 'string' ? token.email : (maybeUser && typeof maybeUser.email === 'string' ? maybeUser.email : undefined)
      const name = typeof token.name === 'string' ? token.name : (maybeUser && typeof maybeUser.name === 'string' ? maybeUser.name : undefined)
      if (email) {
        user = name ? { name, email } : { email }
        try {
          const adminUser = await getAdminUserByEmail(email)
          if (adminUser) {
            user = { email: adminUser.email, name: adminUser.name }
            admin = true
          } else {
            admin = await isAdminEmail(email)
          }
        } catch (e) { void e }
      }
    }
    return NextResponse.json({ admin: !!admin, user })
  } catch (e: unknown) {
    void e
    return NextResponse.json({ admin: false }, { status: 200 })
  }
}
