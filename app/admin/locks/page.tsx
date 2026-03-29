"use client"
import { useState } from 'react'
import AdminNotice from '@/components/admin/AdminNotice'
import AdminLoadingState from '@/components/admin/AdminLoadingState'
import styles from '../admin.module.css'

type Lock = {
  key: string
  ttlMs?: number
  expiresAt?: string | number
}

export default function LocksPage() {
  const [adminKey, setAdminKey] = useState('')
  const [adminUser, setAdminUser] = useState('')
  const [adminPass, setAdminPass] = useState('')
  const [locks, setLocks] = useState<Lock[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const headers: Record<string, string> = {}
      if (adminKey) headers['x-admin-key'] = adminKey
      else if (adminUser && adminPass) headers['authorization'] = 'Basic ' + btoa(`${adminUser}:${adminPass}`)
      const res = await fetch('/admin/api/auth-locks', { headers })
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        const msg = j && typeof j === 'object' && 'error' in j ? String((j as Record<string, unknown>)['error']) : 'Failed'
        throw new Error(msg)
      }
      setLocks(((j as Record<string, unknown>)['locks']) as Lock[] || [])
    } catch (err: unknown) {
      const e = err as Error
      setError(e?.message || String(err))
    }
    setLoading(false)
  }

  async function unlock(k: string) {
    setLoading(true); setError(null)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (adminKey) headers['x-admin-key'] = adminKey
      else if (adminUser && adminPass) headers['authorization'] = 'Basic ' + btoa(`${adminUser}:${adminPass}`)
      const res = await fetch('/admin/api/auth-locks', { method: 'POST', headers, body: JSON.stringify({ key: k }) })
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        const msg = j && typeof j === 'object' && 'error' in j ? String((j as Record<string, unknown>)['error']) : 'Failed'
        throw new Error(msg)
      }
      await load()
    } catch (err: unknown) {
      const e = err as Error
      setError(e?.message || String(err))
    }
    setLoading(false)
  }

  return (
    <main className={styles.utilityPage}>
      <div>
        <h2 className={styles.pageTitle}>Admin: Auth Locks</h2>
        <div className={styles.pageSubtitle}>Inspect and clear active auth lock entries. Signed-in admins can use this directly; key/basic auth is optional for scripted access.</div>
      </div>
      {error ? <AdminNotice message={error} variant="error" actionLabel="Retry" onAction={() => { void load() }} /> : null}
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
        <div className={styles.utilityActions}>
          <button type="button" className={styles.btnGhost} onClick={load} disabled={loading}>
            {loading ? 'Loading locks...' : 'Load locks'}
          </button>
        </div>
      </div>
      {loading ? <AdminLoadingState label="Loading locks" /> : null}
      {!loading && locks.length === 0 ? <div className={styles.emptyStateCard}>No locks found.</div> : null}
      <div className={styles.utilityList}>
        {locks.map((l, idx) => (
          <div key={idx} className={styles.utilityRow}>
            <div className={styles.utilityRowMeta}>
              <strong>{l.key}</strong>
              <div className={styles.utilityMetaText}>{l.ttlMs ? `${Math.ceil(l.ttlMs / 1000)}s remaining` : (l.expiresAt ? new Date(l.expiresAt).toLocaleString() : 'No expiry metadata')}</div>
            </div>
            <div className={styles.utilityActions}>
              <button type="button" className={styles.btnDanger} onClick={() => unlock(l.key)} disabled={loading}>
                Unlock
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
