import { getServerSession } from 'next-auth/next'
import { authOptions } from '../app/api/auth/[...nextauth]/route'
import { query } from './db'

export async function getSessionServer(): Promise<unknown> {
  const session = await getServerSession(authOptions as any)
  return session as unknown
}

export async function requireAdmin() {
  const sessionRaw = await getSessionServer()
  if (!sessionRaw || typeof sessionRaw !== 'object' || !('user' in (sessionRaw as Record<string, unknown>))) return null
  const s = sessionRaw as Record<string, unknown>
  const userObj = s.user as Record<string, unknown> | undefined
  if (!userObj || typeof userObj.email !== 'string') return null
  const email = userObj.email as string
  // find user id by email
  const rows = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]) as Array<{ id: number }>
  const user = Array.isArray(rows) && rows.length ? rows[0] : null
  if (!user) return null
  const roles = await query('SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ? LIMIT 1', [user.id]) as Array<{ name: string }>
  const has = Array.isArray(roles) && roles.length && roles[0].name === 'admin'
  return has ? { id: user.id, email, name: typeof userObj.name === 'string' ? userObj.name : undefined } : null
}

export async function isAdminEmail(email: string) {
  const rows = await query('SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.email=? AND r.name = ? LIMIT 1', [email, 'admin']) as Array<{ id: number }>
  return Array.isArray(rows) && rows.length > 0
}

export default { getSessionServer, requireAdmin, isAdminEmail }
