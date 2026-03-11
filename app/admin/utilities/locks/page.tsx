import { requireAdmin } from '@/lib/auth'
import styles from '../../admin.module.css'
import { query } from '@/lib/db'
import Link from 'next/link'
import UnlockButton from './UnlockButton'

export default async function LocksPage({ searchParams }: { searchParams?: { page?: string; pageSize?: string; q?: string } }) {
  const admin = await requireAdmin()
  if (!admin) return <main style={{padding:20}}>Unauthorized</main>

  const page = Math.max(1, parseInt(searchParams?.page || '1'))
  const pageSize = Math.min(200, Math.max(10, parseInt(searchParams?.pageSize || '50')))
  const q = (searchParams?.q || '').trim()

  let where = '1=1'
  const params: any[] = []
  if (q) { where += ' AND key_name LIKE ?'; params.push(`%${q}%`) }

  const countRows = await query<any[]>('SELECT COUNT(*) as cnt FROM auth_locks WHERE ' + where, params)
  const total = (Array.isArray(countRows) && countRows.length) ? (countRows[0].cnt || 0) : 0

  const offset = (page - 1) * pageSize
  const rows = await query<any[]>('SELECT * FROM auth_locks WHERE ' + where + ' ORDER BY created_at DESC LIMIT ? OFFSET ?', [...params, pageSize, offset])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const baseQuery = (p:number) => {
    const sp = new URLSearchParams()
    sp.set('page', String(p))
    sp.set('pageSize', String(pageSize))
    if (q) sp.set('q', q)
    return `/admin/utilities/locks?${sp.toString()}`
  }

  return (
    <main>
      <div className={styles.adminTop}>
        <div className="title">Auth Locks</div>
        <div className={styles.smallMuted}>Manage rate-limiter locks</div>
      </div>
      <div className={styles.adminTableWrap}>
        <table className={styles.adminTable}>
          <thead>
            <tr><th>Key</th><th>Locked Until</th><th>Reason</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.key_name}</td>
                <td>{new Date(r.locked_until).toLocaleString()}</td>
                <td>{r.reason}</td>
                <td>
                  <UnlockButton keyName={r.key_name} />
                </td>
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
      <div style={{marginTop:18}}>
        <Link href="/admin/utilities" className={styles.btn}>Back</Link>
      </div>
    </main>
  )
}
