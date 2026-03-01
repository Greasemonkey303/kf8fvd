"use client"

import React, { useEffect, useState } from 'react'
import { Card } from '@/components'

type UserItem = { id: number; name: string; email: string; is_active: number; roles?: string[] }

const AVAILABLE_ROLES = ['admin', 'editor', 'author']

export default function AdminUsers() {
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', email: '', password: '', roles: [] as string[] })

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/users')
    const data = await res.json()
    setUsers((data && data.items) ? data.items : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.email || !form.password) return
    await fetch('/api/admin/users', { method: 'POST', body: JSON.stringify(form) })
    setForm({ name: '', email: '', password: '', roles: [] })
    await load()
  }

  return (
    <main className="page-pad">
      <div className="center-max">
        <Card title="Users" subtitle="Manage users and roles">
          <div className="stack">
            <form onSubmit={submit} className="form-grid" suppressHydrationWarning>
              <label>
                <div className="field-label">Name</div>
                <input value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="form-input" suppressHydrationWarning />
              </label>
              <label>
                <div className="field-label">Email</div>
                <input type="email" value={form.email} onChange={e=>setForm({...form, email: e.target.value})} className="form-input" suppressHydrationWarning />
              </label>
              <label>
                <div className="field-label">Password</div>
                <input type="password" value={form.password} onChange={e=>setForm({...form, password: e.target.value})} className="form-input" suppressHydrationWarning />
              </label>
              <div>
                <div className="field-label">Role</div>
                <div className="flex gap-2">
                  {AVAILABLE_ROLES.map(r=> (
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
              <div className="flex justify-end mt-4">
                <button className="btn-ghost" type="submit" suppressHydrationWarning>Create</button>
              </div>
            </form>

            <hr />

            {loading ? (
              <p>Loading…</p>
            ) : (
              <ul className="stack">
                {users.map(u => (
                  <li key={u.id} className="row between">
                    <div>
                      <strong>{u.name || u.email}</strong> <span className="muted">{u.email}</span>
                      {u.roles && u.roles.length ? <div className="muted">Roles: {u.roles.join(', ')}</div> : null}
                    </div>
                    <div className="flex gap-2">
                      <a className="btn-ghost" href={`/admin/users/${u.id}`}>Edit</a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </main>
  )
}
