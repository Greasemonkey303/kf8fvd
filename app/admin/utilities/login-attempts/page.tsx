import { requireAdmin } from '@/lib/auth'
import styles from '../../admin.module.css'
import { query } from '@/lib/db'
import Link from 'next/link'

export default async function LoginAttemptsPage({ searchParams }: { searchParams?: { page?: string; pageSize?: string; q?: string; email?: string; ip?: string } }) {
  const admin = await requireAdmin()
  if (!admin) return <main style={{padding:20}}>Unauthorized</main>

  const page = Math.max(1, parseInt(searchParams?.page || '1'))
  const pageSize = Math.min(200, Math.max(10, parseInt(searchParams?.pageSize || '50')))
  const q = (searchParams?.q || '').trim()
  const email = (searchParams?.email || '').trim()
  const ip = (searchParams?.ip || '').trim()

  let where = '1=1'
  const params: any[] = []
  if (q) {
    where += ' AND (u.email LIKE ? OR la.email LIKE ? OR la.ip LIKE ? OR la.reason LIKE ?)'
    const like = `%${q}%`
    params.push(like, like, like, like)
  }
  if (email) { where += ' AND (u.email = ? OR la.email = ?)'; params.push(email, email) }
  if (ip) { where += ' AND la.ip = ?'; params.push(ip) }

  const countRows = await query<any[]>('SELECT COUNT(*) as cnt FROM login_attempts la LEFT JOIN users u ON u.id = la.user_id WHERE ' + where, params)
  const total = (Array.isArray(countRows) && countRows.length) ? (countRows[0].cnt || 0) : 0

  const offset = (page - 1) * pageSize
  const rows = await query<any[]>('SELECT la.*, u.email as user_email FROM login_attempts la LEFT JOIN users u ON u.id = la.user_id WHERE ' + where + ' ORDER BY la.created_at DESC LIMIT ? OFFSET ?', [...params, pageSize, offset])

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
