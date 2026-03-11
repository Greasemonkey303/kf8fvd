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

  let where = '1=1'
  const params: any[] = []
  if (q) {
    where += ' AND key_name LIKE ?'
    params.push(`%${q}%`)
  }

  const countRows = await query<any[]>('SELECT COUNT(*) as cnt FROM auth_locks WHERE ' + where, params)
  const total = (Array.isArray(countRows) && countRows.length) ? (countRows[0].cnt || 0) : 0

  const offset = (page - 1) * pageSize
  const rows = await query<any[]>('SELECT * FROM auth_locks WHERE ' + where + ' ORDER BY created_at DESC LIMIT ? OFFSET ?', [...params, pageSize, offset])
  return NextResponse.json({ rows, total, page, pageSize })
}
