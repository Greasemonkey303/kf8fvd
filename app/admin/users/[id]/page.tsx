"use client"

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components'

export default function UserEditor({ params }: { params: { id: string } }) {
  // `params` may be a Promise in the App Router — unwrap with React.use when available
  const resolvedParams: any = (React as any).use ? (React as any).use(params) : params
  const id = resolvedParams && resolvedParams.id
  const router = useRouter()
  const [form, setForm] = useState({ id: 0, name: '', email: '', password: '', is_active: true, roles: [] as string[] })
  const [loading, setLoading] = useState(true)
  const AVAILABLE_ROLES = ['admin','editor','author']

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/users?page=1&limit=1000')
      const data = await res.json()
      const found = (data.items || []).find((u: any) => String(u.id) === String(id))
      if (found) setForm({ id: found.id, name: found.name || '', email: found.email, password: '', is_active: !!found.is_active, roles: found.roles || [] })
      setLoading(false)
    })()
  }, [id])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/admin/users', { method: 'PUT', body: JSON.stringify(form) })
    router.push('/admin/users')
  }
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  async function confirmDelete() {
    try {
      await fetch(`/api/admin/users?id=${form.id}`, { method: 'DELETE' })
    } finally {
      setShowDeleteConfirm(false)
      router.push('/admin/users')
    }
  }

  return (
    <main className="page-pad">
      <div className="center-max">
        <Card title="Edit User" subtitle={`ID: ${id}`}>
          {loading ? <p>Loading…</p> : (
            <form onSubmit={save} className="form-grid">
              <label>
                <div className="field-label">Name</div>
                <input value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="form-input" suppressHydrationWarning />
              </label>
              <label>
                <div className="field-label">Email</div>
                <input type="email" value={form.email} onChange={e=>setForm({...form, email: e.target.value})} className="form-input" suppressHydrationWarning />
              </label>
              <label>
                <div className="field-label">Password (leave blank to keep)</div>
                <input type="password" value={form.password} onChange={e=>setForm({...form, password: e.target.value})} className="form-input" suppressHydrationWarning />
              </label>
              <label>
                <div className="field-label">Active</div>
                <input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form, is_active: e.target.checked})} suppressHydrationWarning />
              </label>

              <div>
                <div className="field-label">Roles</div>
                <div className="flex gap-2">
                  {AVAILABLE_ROLES.map(r => (
                    <label key={r} className="flex items-center gap-2">
                      <input type="checkbox" checked={form.roles.includes(r)} onChange={e=>{
                        const next = form.roles.includes(r) ? form.roles.filter(x=>x!==r) : [...form.roles, r]
                        setForm({...form, roles: next})
                      }} />
                      <span className="muted">{r}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost" type="submit">Save</button>
                <button className="btn-ghost" type="button" onClick={()=>router.push('/admin/users')}>Cancel</button>
                <button className="btn-danger" type="button" onClick={()=>setShowDeleteConfirm(true)}>Delete</button>
              </div>
            </form>
          )}
          {showDeleteConfirm && (
            <div className="modal-overlay">
              <div className="modal card">
                <h4>Confirm delete</h4>
                <p>Are you sure you want to delete this user? This action cannot be undone.</p>
                <div className="flex gap-2">
                  <button className="btn-danger" onClick={confirmDelete}>Delete</button>
                  <button className="btn-ghost" onClick={()=>setShowDeleteConfirm(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </main>
  )
}
