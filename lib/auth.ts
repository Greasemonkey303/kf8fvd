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

export async function getSessionServer(): Promise<Record<string, unknown> | null> {
  const session = await getServerSession(authOptions as NextAuthOptions)
  if (session) return session as unknown as Record<string, unknown>

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

const auth = { getSessionServer, getAdminUserByEmail, requireAdmin, isAdminEmail }
export default auth
