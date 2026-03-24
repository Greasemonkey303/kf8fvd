"use client"
import { useState } from 'react'

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
    <div style={{ padding: 16 }}>
      <h2>Admin: Auth Locks</h2>
      <div style={{ marginBottom: 8 }}>
        <input placeholder="Admin key (or leave blank to use Basic auth)" value={adminKey} onChange={e => setAdminKey(e.target.value)} style={{ padding: 8, width: 360 }} />
        <button onClick={load} style={{ marginLeft: 8, padding: '8px 12px' }}>{loading ? 'Loading...' : 'Load Locks'}</button>
      </div>
      <div style={{ marginBottom: 8 }}>
        <input placeholder="Admin user" value={adminUser} onChange={e => setAdminUser(e.target.value)} style={{ padding: 8, width: 170, marginRight: 8 }} />
        <input placeholder="Admin pass" type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)} style={{ padding: 8, width: 170 }} />
      </div>
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      <div>
        {locks.length === 0 && <div>No locks found.</div>}
        <ul>
          {locks.map((l, idx) => (
            <li key={idx} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ minWidth: 400 }}>{l.key}</div>
                <div style={{ color: '#666' }}>{l.ttlMs ? `${Math.ceil(l.ttlMs/1000)}s` : (l.expiresAt ? new Date(l.expiresAt).toLocaleString() : '')}</div>
                <button onClick={() => unlock(l.key)} style={{ marginLeft: 'auto' }}>Unlock</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
