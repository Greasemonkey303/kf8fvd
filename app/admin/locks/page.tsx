"use client"
import { useState } from 'react'

export default function LocksPage() {
  const [adminKey, setAdminKey] = useState('')
  const [adminUser, setAdminUser] = useState('')
  const [adminPass, setAdminPass] = useState('')
  const [locks, setLocks] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const headers: any = {}
      if (adminKey) headers['x-admin-key'] = adminKey
      else if (adminUser && adminPass) headers['authorization'] = 'Basic ' + btoa(`${adminUser}:${adminPass}`)
      const res = await fetch('/api/admin/auth-locks', { headers })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Failed')
      setLocks(j.locks || [])
    } catch (e: any) { setError(e?.message || String(e)) }
    setLoading(false)
  }

  async function unlock(k: string) {
    setLoading(true); setError(null)
    try {
      const headers: any = { 'Content-Type': 'application/json' }
      if (adminKey) headers['x-admin-key'] = adminKey
      else if (adminUser && adminPass) headers['authorization'] = 'Basic ' + btoa(`${adminUser}:${adminPass}`)
      const res = await fetch('/api/admin/auth-locks', { method: 'POST', headers, body: JSON.stringify({ key: k }) })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Failed')
      await load()
    } catch (e: any) { setError(e?.message || String(e)) }
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
