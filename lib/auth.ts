import { getServerSession } from 'next-auth/next'
import type { NextAuthOptions } from 'next-auth'
import { headers } from 'next/headers'
import jwt from 'jsonwebtoken'
import { authOptions } from '../app/api/auth/[...nextauth]/route'
import { query } from './db'

export type AdminUser = {
  id: number
  email: string
  name?: string
}

export type AdminRequestAuthorization = {
  ok: true
  admin: AdminUser | null
  actor: string
  actor_type: 'session' | 'api_key' | 'basic' | 'dev'
}

function parseBasicAuth(header: string | null) {
  if (!header) return null
  const match = header.match(/^Basic (.+)$/i)
  if (!match) return null
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8')
    const separatorIndex = decoded.indexOf(':')
    if (separatorIndex < 0) return null
    return {
      user: decoded.slice(0, separatorIndex),
      pass: decoded.slice(separatorIndex + 1),
    }
  } catch {
    return null
  }
}

export async function getSessionServer(): Promise<Record<string, unknown> | null> {
  try {
    const session = await getServerSession(authOptions as NextAuthOptions)
    if (session) return session as unknown as Record<string, unknown>
  } catch (e) {
    void e
  }

  try {
    const hdrs = await headers()
    const cookieHeader = String(hdrs.get('cookie') || '')
    const match = cookieHeader.match(/(?:__Secure-next-auth.session-token|next-auth.session-token)=([^;\s]+)/)
    if (!match?.[1] || !process.env.NEXTAUTH_SECRET) return null
    const decoded = jwt.verify(match[1], process.env.NEXTAUTH_SECRET)
    if (!decoded || typeof decoded !== 'object') return null
    const token = decoded as Record<string, unknown>
    const tokenUser = (token.user && typeof token.user === 'object') ? token.user as Record<string, unknown> : null
    const email = typeof token.email === 'string' ? token.email : (tokenUser && typeof tokenUser.email === 'string' ? tokenUser.email : null)
    const name = typeof token.name === 'string' ? token.name : (tokenUser && typeof tokenUser.name === 'string' ? tokenUser.name : undefined)
    if (!email) return null
    return { user: name ? { email, name } : { email } }
  } catch (e) {
    void e
    return null
  }
}

export async function getAdminUserByEmail(email: string): Promise<AdminUser | null> {
  const rows = await query(
    'SELECT u.id, u.email, u.name FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE u.email = ? AND r.name = ? LIMIT 1',
    [email, 'admin']
  ) as Array<{ id: number; email: string; name?: string | null }>
  const row = Array.isArray(rows) && rows.length ? rows[0] : null
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: typeof row.name === 'string' ? row.name : undefined,
  }
}

export async function requireAdmin() {
  const sessionRaw = await getSessionServer()
  if (!sessionRaw || typeof sessionRaw !== 'object' || !('user' in (sessionRaw as Record<string, unknown>))) return null
  const s = sessionRaw as Record<string, unknown>
  const userObj = s.user as Record<string, unknown> | undefined
  if (!userObj || typeof userObj.email !== 'string') return null
  const email = userObj.email as string
  return await getAdminUserByEmail(email)
}

export async function isAdminEmail(email: string) {
  return !!(await getAdminUserByEmail(email))
}

export async function authorizeAdminRequest(req: Request, options?: { allowUtilityCredentials?: boolean }): Promise<AdminRequestAuthorization | { ok: false }> {
  const admin = await requireAdmin()
  if (admin) {
    return {
      ok: true,
      admin,
      actor: admin.email,
      actor_type: 'session',
    }
  }

  if (!options?.allowUtilityCredentials) return { ok: false }

  const secret = process.env.ADMIN_API_KEY || ''
  const headerKey = req.headers.get('x-admin-key') || ''
  if (secret && headerKey === secret) {
    return { ok: true, admin: null, actor: 'api-key', actor_type: 'api_key' }
  }

  const authorization = req.headers.get('authorization') || ''
  if (secret && authorization.toLowerCase().startsWith('bearer ') && authorization.slice(7) === secret) {
    return { ok: true, admin: null, actor: 'api-key', actor_type: 'api_key' }
  }

  const basic = parseBasicAuth(authorization)
  if (basic && process.env.ADMIN_BASIC_USER && process.env.ADMIN_BASIC_PASSWORD) {
    if (basic.user === process.env.ADMIN_BASIC_USER && basic.pass === process.env.ADMIN_BASIC_PASSWORD) {
      return { ok: true, admin: null, actor: basic.user, actor_type: 'basic' }
    }
  }

  if (!process.env.ADMIN_API_KEY && !process.env.ADMIN_BASIC_USER && (process.env.NODE_ENV || 'development') !== 'production') {
    return { ok: true, admin: null, actor: 'dev', actor_type: 'dev' }
  }

  return { ok: false }
}

const auth = { getSessionServer, getAdminUserByEmail, requireAdmin, isAdminEmail, authorizeAdminRequest }
export default auth
