import { requireAdmin } from '@/lib/auth'
import styles from '../../admin.module.css'
import { query } from '@/lib/db'
import Link from 'next/link'

export default async function LoginAttemptsPage({ searchParams }: { searchParams?: Record<string, unknown> }) {
  const admin = await requireAdmin()
  if (!admin) return <main style={{padding:20}}>Unauthorized</main>

  // `searchParams` may be a Promise in some Next.js versions; await if so.
  const sp = (searchParams ? await searchParams : {}) || {}
  const rawPage = (sp.page ?? '1')
  const rawPageSize = (sp.pageSize ?? '50')
  const pageNum = parseInt(String(rawPage || '1'), 10)
  const page = Number.isNaN(pageNum) ? 1 : Math.max(1, pageNum)
  const pageSizeNum = parseInt(String(rawPageSize || '50'), 10)
  const pageSize = Number.isNaN(pageSizeNum) ? 50 : Math.min(200, Math.max(10, pageSizeNum))
  const q = String(sp.q || '').trim()
  const email = String(sp.email || '').trim()
  const ip = String(sp.ip || '').trim()

  let where = '1=1'
  const params: unknown[] = []
  if (q) {
    where += ' AND (u.email LIKE ? OR la.email LIKE ? OR la.ip LIKE ? OR la.reason LIKE ?)'
    const like = `%${q}%`
    params.push(like, like, like, like)
  }
  if (email) { where += ' AND (u.email = ? OR la.email = ?)'; params.push(email, email) }
  if (ip) { where += ' AND la.ip = ?'; params.push(ip) }

  // Debug: log the built query parameters to server console to help diagnose DB errors
  console.log('[admin:login-attempts] query params', { where, params, pageSize, page })
  const countRows = await query<Record<string, unknown>[]>('SELECT COUNT(*) as cnt FROM login_attempts la LEFT JOIN users u ON u.id = la.user_id WHERE ' + where, params)
  const total = (Array.isArray(countRows) && countRows.length) ? (countRows[0].cnt || 0) : 0

  const offset = (page - 1) * pageSize
  // Ensure numeric values are passed for LIMIT/OFFSET
  const limitVal = Number(pageSize)
  const offsetVal = Number(offset)
  console.log('[admin:login-attempts] final params', { paramsCount: params.length, limitVal, offsetVal })
  // Embed numeric LIMIT/OFFSET directly to avoid prepared-statement argument issues
  const rows = await query<Record<string, unknown>[]>('SELECT la.*, u.email as user_email FROM login_attempts la LEFT JOIN users u ON u.id = la.user_id WHERE ' + where + ' ORDER BY la.created_at DESC LIMIT ' + limitVal + ' OFFSET ' + offsetVal, params)

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const baseQuery = (p:number) => {
    const sp = new URLSearchParams()
    sp.set('page', String(p))
    sp.set('pageSize', String(pageSize))
    if (q) sp.set('q', q)
    if (email) sp.set('email', email)
    if (ip) sp.set('ip', ip)
    return `/admin/utilities/login-attempts?${sp.toString()}`
  }

  return (
    <main>
      <div className={styles.adminTop}>
        <div className="title">Login Attempts</div>
        <div className={styles.smallMuted}>Recent authentication attempts</div>
      </div>

      <div className={styles.adminTableWrap}>
        <table className={styles.adminTable}>
          <thead>
            <tr><th>When</th><th>Email</th><th>IP</th><th>Success</th><th>Reason</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.user_email || r.email}</td>
                <td>{r.ip}</td>
                <td>{r.success ? 'Yes' : 'No'}</td>
                <td>{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{marginTop:12}}>
        <div>Page {page} / {totalPages} — {total} rows</div>
        <div style={{marginTop:6}}>
          {page > 1 && <Link href={baseQuery(page-1)} className={styles.btn}>Prev</Link>}
          {page < totalPages && <Link href={baseQuery(page+1)} className={styles.btn} style={{marginLeft:8}}>Next</Link>}
        </div>
      </div>
    </main>
  )
}
