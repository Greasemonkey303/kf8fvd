import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query } from '@/lib/db'

export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
  const pageSize = Math.min(200, Math.max(10, parseInt(url.searchParams.get('pageSize') || '50')))
  const q = (url.searchParams.get('q') || '').trim()
  const email = (url.searchParams.get('email') || '').trim()
  const ip = (url.searchParams.get('ip') || '').trim()

  let where = '1=1'
  const params: any[] = []
  if (q) {
    where += ' AND (u.email LIKE ? OR la.email LIKE ? OR la.ip LIKE ? OR la.reason LIKE ?)'
    const like = `%${q}%`
    params.push(like, like, like, like)
  }
  if (email) {
    where += ' AND (u.email = ? OR la.email = ?)'
    params.push(email, email)
  }
  if (ip) {
    where += ' AND la.ip = ?'
    params.push(ip)
  }

  const countRows = await query<any[]>('SELECT COUNT(*) as cnt FROM login_attempts la LEFT JOIN users u ON u.id = la.user_id WHERE ' + where, params)
  const total = (Array.isArray(countRows) && countRows.length) ? (countRows[0].cnt || 0) : 0

  const offset = (page - 1) * pageSize
  const rows = await query<any[]>('SELECT la.*, u.email as user_email FROM login_attempts la LEFT JOIN users u ON u.id = la.user_id WHERE ' + where + ' ORDER BY la.created_at DESC LIMIT ? OFFSET ?', [...params, pageSize, offset])
  return NextResponse.json({ rows, total, page, pageSize })
}
