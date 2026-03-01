"use client"

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components'

export default function UserEditor({ params }: { params: { id: string } }) {
  // `params` may be a Promise in the App Router — unwrap with React.use when available
  const resolvedParams: any = (React as any).use ? (React as any).use(params) : params
  const id = resolvedParams && resolvedParams.id
  const router = useRouter()
  const [form, setForm] = useState({ id: 0, name: '', email: '', password: '', is_active: true })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/users?page=1&limit=1000')
      const data = await res.json()
      const found = (data.items || []).find((u: any) => String(u.id) === String(id))
      if (found) setForm({ id: found.id, name: found.name || '', email: found.email, password: '', is_active: !!found.is_active })
      setLoading(false)
    })()
  }, [id])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/admin/users', { method: 'PUT', body: JSON.stringify(form) })
    router.push('/admin/users')
  }

  return (
    <main className="page-pad">
      <div className="center-max">
        <Card title="Edit User" subtitle={`ID: ${id}`}>
          {loading ? <p>Loading…</p> : (
            <form onSubmit={save} className="form-grid">
              <label>
                <div className="field-label">Name</div>
                <input value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="form-input" />
              </label>
              <label>
                <div className="field-label">Email</div>
                <input type="email" value={form.email} onChange={e=>setForm({...form, email: e.target.value})} className="form-input" />
              </label>
              <label>
                <div className="field-label">Password (leave blank to keep)</div>
                <input type="password" value={form.password} onChange={e=>setForm({...form, password: e.target.value})} className="form-input" />
              </label>
              <label>
                <div className="field-label">Active</div>
                <input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form, is_active: e.target.checked})} />
              </label>
              <div className="flex gap-2">
                <button className="btn-ghost" type="submit">Save</button>
                <button className="btn-ghost" type="button" onClick={()=>router.push('/admin/users')}>Cancel</button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </main>
  )
}
