import { getServerSession } from 'next-auth/next'
import type { NextAuthOptions } from 'next-auth'
import { authOptions } from '../app/api/auth/[...nextauth]/route'
import { query } from './db'

export type AdminUser = {
  id: number
  email: string
  name?: string
}

export async function getSessionServer(): Promise<Record<string, unknown> | null> {
  const session = await getServerSession(authOptions as NextAuthOptions)
  return session as Record<string, unknown> | null
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
