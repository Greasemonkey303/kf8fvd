import { getServerSession } from 'next-auth/next'
import { authOptions } from '../app/api/auth/[...nextauth]/route'
import { query } from './db'

export async function getSessionServer() {
  const session = await getServerSession(authOptions as any)
  return session
}

export async function requireAdmin() {
  const session = await getSessionServer()
  if (!session?.user?.email) return null
  // find user id by email
  const rows: any = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [session.user.email])
  const user = Array.isArray(rows) && rows.length ? rows[0] : null
  if (!user) return null
  const roles: any = await query('SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ? LIMIT 1', [user.id])
  const has = Array.isArray(roles) && roles.length && roles[0].name === 'admin'
  return has ? { id: user.id, email: session.user.email, name: session.user.name } : null
}

export async function isAdminEmail(email: string) {
  const rows: any = await query('SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.email=? AND r.name = ? LIMIT 1', [email, 'admin'])
  return Array.isArray(rows) && rows.length > 0
}

export default { getSessionServer, requireAdmin, isAdminEmail }
