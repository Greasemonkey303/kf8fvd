"use client"
import { useEffect, useState } from 'react'

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

  useEffect(() => { /* no auto-load to require admin creds */ }, [])

  function prev() { if (offset - limit >= 0) load(offset - limit) }
  function next() { if (offset + limit < (total || 0)) load(offset + limit) }

  return (
    <div style={{ padding: 16 }}>
      <h2>Admin: Audit Log</h2>
      <div style={{ marginBottom: 8 }}>
        <input placeholder="Admin key (or leave blank to use Basic auth)" value={adminKey} onChange={e => setAdminKey(e.target.value)} style={{ padding: 8, width: 360 }} />
        <button onClick={() => load(0)} style={{ marginLeft: 8, padding: '8px 12px' }}>{loading ? 'Loading...' : 'Load Audit'}</button>
        <button onClick={exportCsv} style={{ marginLeft: 8, padding: '8px 12px' }}>{loading ? 'Working...' : 'Export CSV'}</button>
      </div>
      <div style={{ marginBottom: 8 }}>
        <input placeholder="Admin user" value={adminUser} onChange={e => setAdminUser(e.target.value)} style={{ padding: 8, width: 170, marginRight: 8 }} />
        <input placeholder="Admin pass" type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)} style={{ padding: 8, width: 170 }} />
      </div>
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}

      <div style={{ marginBottom: 8 }}>
        <strong>Total:</strong> {total}
        <div style={{ float: 'right' }}>
          <button onClick={prev} disabled={offset === 0} style={{ marginRight: 8 }}>Prev</button>
          <button onClick={next} disabled={offset + limit >= (total || 0)}>Next</button>
        </div>
      </div>

      <div>
        {actions.length === 0 && <div>No entries found.</div>}
        <ul>
          {actions.map((a, idx) => (
            <li key={a.id ?? idx} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ minWidth: 220 }}>{a.action} <span style={{ color: '#666' }}>by</span> {a.actor}</div>
                <div style={{ minWidth: 300 }}>{a.target_key || ''}</div>
                <div style={{ color: '#666' }}>{a.reason || ''}</div>
                <div style={{ marginLeft: 'auto', color: '#666' }}>{a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}</div>
              </div>
              {a.meta ? <pre style={{ marginTop: 6, background: '#f7f7f7', padding: 8, borderRadius: 4 }}>{JSON.stringify(a.meta, null, 2)}</pre> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
