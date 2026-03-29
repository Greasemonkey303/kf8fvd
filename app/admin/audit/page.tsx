"use client"
import { useEffect, useState } from 'react'
import AdminLoadingState from '@/components/admin/AdminLoadingState'
import AdminNotice from '@/components/admin/AdminNotice'
import styles from '../admin.module.css'

type AdminAction = {
  id?: string | number
  action?: string
  actor?: string
  target_key?: string
  reason?: string
  createdAt?: string | number
  meta?: unknown
}

export default function AuditPage() {
  const [adminKey, setAdminKey] = useState('')
  const [adminUser, setAdminUser] = useState('')
  const [adminPass, setAdminPass] = useState('')
  const [actions, setActions] = useState<AdminAction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limit] = useState(50)
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)

  async function load(off = 0) {
    setLoading(true); setError(null)
    try {
      const headers: Record<string, string> = {}
      if (adminKey) headers['x-admin-key'] = adminKey
      else if (adminUser && adminPass) headers['authorization'] = 'Basic ' + btoa(`${adminUser}:${adminPass}`)
      const res = await fetch(`/admin/api/admin-actions?limit=${limit}&offset=${off}`, { headers })
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        const msg = j && typeof j === 'object' && 'error' in j ? String((j as Record<string, unknown>)['error']) : 'Failed'
        throw new Error(msg)
      }
      setActions(((j as Record<string, unknown>)['actions']) as AdminAction[] || [])
      setTotal(typeof ((j as Record<string, unknown>)['total']) === 'number' ? Number((j as Record<string, unknown>)['total']) : 0)
      setOffset(off)
    } catch (err: unknown) {
      const e = err as Error
      setError(e?.message || String(err))
    }
    setLoading(false)
  }

  async function exportCsv() {
    setLoading(true); setError(null)
    try {
      const headers: Record<string, string> = {}
      if (adminKey) headers['x-admin-key'] = adminKey
      else if (adminUser && adminPass) headers['authorization'] = 'Basic ' + btoa(`${adminUser}:${adminPass}`)
      const res = await fetch(`/admin/api/admin-actions?limit=${limit}&offset=${offset}&format=csv`, { headers })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
        const msg = j && typeof j === 'object' && 'error' in j ? String((j as Record<string, unknown>)['error']) : 'Failed to export'
        throw new Error(msg)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'admin_actions.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      const e = err as Error
      setError(e?.message || String(err))
    }
    setLoading(false)
  }

  useEffect(() => { /* manual load keeps the utility view quiet until requested */ }, [])

  function prev() { if (offset - limit >= 0) load(offset - limit) }
  function next() { if (offset + limit < (total || 0)) load(offset + limit) }

  return (
    <main className={styles.utilityPage}>
      <div>
        <h2 className={styles.pageTitle}>Admin: Audit Log</h2>
        <div className={styles.pageSubtitle}>Review recorded admin actions and export the current window. Signed-in admins can use this directly; key/basic auth is optional for scripted access.</div>
      </div>
      {error ? <AdminNotice message={error} variant="error" actionLabel="Retry" onAction={() => { void load(offset) }} /> : null}
      <div className={styles.utilityControls}>
        <label className={styles.utilityField}>
          <div className={styles.fieldLabel}>Admin key</div>
          <input className={styles.formInput} placeholder="Optional admin key" value={adminKey} onChange={e => setAdminKey(e.target.value)} />
        </label>
        <label className={styles.utilityField}>
          <div className={styles.fieldLabel}>Admin user</div>
          <input className={styles.formInput} placeholder="Optional basic-auth user" value={adminUser} onChange={e => setAdminUser(e.target.value)} />
        </label>
        <label className={styles.utilityField}>
          <div className={styles.fieldLabel}>Admin password</div>
          <input className={styles.formInput} placeholder="Optional basic-auth password" type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)} />
        </label>
      </div>
      <div className={styles.utilityActions}>
        <button type="button" className={styles.btnGhost} onClick={() => load(0)} disabled={loading}>{loading ? 'Loading audit...' : 'Load audit'}</button>
        <button type="button" className={styles.btnGhost} onClick={exportCsv} disabled={loading}>{loading ? 'Exporting...' : 'Export CSV'}</button>
        <button type="button" className={styles.btnGhost} onClick={prev} disabled={loading || offset === 0}>Prev</button>
        <button type="button" className={styles.btnGhost} onClick={next} disabled={loading || offset + limit >= (total || 0)}>Next</button>
      </div>
      <div className={styles.smallMuted}>Total: {total}</div>
      {loading ? <AdminLoadingState label="Loading audit log" /> : null}
      {!loading && actions.length === 0 ? <div className={styles.emptyStateCard}>No entries found.</div> : null}
      <div className={styles.utilityList}>
        {actions.map((a, idx) => (
          <div key={a.id ?? idx} className={styles.utilityRow}>
            <div className={styles.utilityRowMeta}>
              <div><strong>{a.action || 'Action'}</strong> <span className={styles.utilityMetaText}>by {a.actor || 'unknown actor'}</span></div>
              <div className={styles.utilityMetaText}>{a.target_key || 'No target key'}{a.reason ? ` • ${a.reason}` : ''}</div>
              <div className={styles.utilityMetaText}>{a.createdAt ? new Date(a.createdAt).toLocaleString() : 'No timestamp'}</div>
              {a.meta ? <pre className={styles.utilityMetaPre}>{JSON.stringify(a.meta, null, 2)}</pre> : null}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
