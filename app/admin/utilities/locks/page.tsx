import { requireAdmin } from '@/lib/auth'
import styles from '../../admin.module.css'
import { query } from '@/lib/db'
import Link from 'next/link'
import UnlockButton from './UnlockButton'

export default async function LocksPage({ searchParams }: { searchParams?: { page?: string; pageSize?: string; q?: string } }) {
  const admin = await requireAdmin()
  if (!admin) return <main className={styles.pagePad20}>Unauthorized</main>

  const page = Math.max(1, parseInt(searchParams?.page || '1'))
  const pageSize = Math.min(200, Math.max(10, parseInt(searchParams?.pageSize || '50')))
  const q = (searchParams?.q || '').trim()

  let where = '1=1'
  const params: unknown[] = []
  if (q) { where += ' AND key_name LIKE ?'; params.push(`%${q}%`) }

  const countRows = await query<Record<string, unknown>[]>('SELECT COUNT(*) as cnt FROM auth_locks WHERE ' + where, params)
  const total = Number((Array.isArray(countRows) && countRows.length) ? (countRows[0].cnt || 0) : 0)

  const offset = (page - 1) * pageSize
  const limitVal = Number(pageSize)
  const offsetVal = Number(offset)
  const rows = await query<Record<string, unknown>[]>('SELECT * FROM auth_locks WHERE ' + where + ' ORDER BY created_at DESC LIMIT ' + limitVal + ' OFFSET ' + offsetVal, params)

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
              <tr key={String(r.id)}>
                <td>{String(r.key_name || '')}</td>
                <td>{new Date(String(r.locked_until || '')).toLocaleString()}</td>
                <td>{String(r.reason || '')}</td>
                <td>
                  <UnlockButton keyName={String(r.key_name || '')} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.sectionSpacing}>
        <div>Page {page} / {totalPages} — {total} rows</div>
        <div className={styles.mt6}>
          {page > 1 && <Link href={baseQuery(page-1)} className={styles.btn}>Prev</Link>}
          {page < totalPages && <Link href={baseQuery(page+1)} className={`${styles.btn} ${styles.inlineGapLeft8}`}>Next</Link>}
        </div>
      </div>
      <div className={styles.sectionSpacing}>
        <Link href="/admin/utilities" className={styles.btn}>Back</Link>
      </div>
    </main>
  )
}
