"use client"

import React, { useEffect, useState } from 'react'
import { Card } from '@/components'

type PageItem = { id: number; slug: string; title: string; is_published: number }

export default function AdminPages() {
  const [pages, setPages] = useState<PageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ id: 0, slug: '', title: '', content: '', is_published: false })

  async function load(p = 1) {
    setLoading(true)
    const res = await fetch(`/api/admin/pages?page=${p}&limit=20`)
    const data = await res.json()
    setPages(data.items || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.slug || !form.title) return
    if (form.id) {
      await fetch('/api/admin/pages', { method: 'PUT', body: JSON.stringify(form) })
    } else {
      await fetch('/api/admin/pages', { method: 'POST', body: JSON.stringify(form) })
    }
    setForm({ id: 0, slug: '', title: '', content: '', is_published: false })
    await load()
  }

  async function edit(p: PageItem) {
    setForm({ id: p.id, slug: p.slug, title: p.title, content: '', is_published: !!p.is_published })
  }

  async function remove(id: number) {
    if (!confirm('Delete this page?')) return
    await fetch('/api/admin/pages?id=' + id, { method: 'DELETE' })
    await load()
  }

  return (
    <main className="page-pad">
      <div className="center-max">
        <Card title="Pages" subtitle="Create and edit site pages">
          <div className="stack">
            <form onSubmit={submit} className="form-grid" suppressHydrationWarning>
              <label>
                <div className="field-label">Slug</div>
                <input value={form.slug} onChange={e=>setForm({...form, slug: e.target.value})} className="form-input" />
              </label>
              <label>
                <div className="field-label">Title</div>
                <input value={form.title} onChange={e=>setForm({...form, title: e.target.value})} className="form-input" />
              </label>
              <label>
                <div className="field-label">Published</div>
                <input type="checkbox" checked={form.is_published} onChange={e=>setForm({...form, is_published: e.target.checked})} />
              </label>
              <div className="flex justify-end mt-4">
                <button className="btn-ghost" type="submit">Save</button>
              </div>
            </form>

            <hr />

            {loading ? <p>Loading…</p> : (
              <>
                <ul className="stack">
                  {pages.map(p => (
                    <li key={p.id} className="row between">
                      <div>
                        <strong>{p.title}</strong> <span className="muted">({p.slug})</span>
                      </div>
                      <div className="flex gap-2">
                        <a className="btn-ghost" href={`/admin/pages/${p.id}`}>Edit</a>
                        <button className="btn-ghost" onClick={()=>remove(p.id)}>Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button className="btn-ghost" onClick={()=>load(1)}>First</button>
                  <button className="btn-ghost" onClick={()=>load()}>Refresh</button>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </main>
  )
}
