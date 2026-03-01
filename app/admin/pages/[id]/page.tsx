"use client"

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components'

export default function PageEditor({ params }: { params: { id: string } }) {
  const id = params.id
  const router = useRouter()
  const [form, setForm] = useState({ id: 0, slug: '', title: '', content: '', is_published: false })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/pages?page=1&limit=1000')
      const data = await res.json()
      const found = (data.items || []).find((p: any) => String(p.id) === String(id))
      if (found) setForm({ id: found.id, slug: found.slug, title: found.title, content: found.content || '', is_published: !!found.is_published })
      setLoading(false)
    })()
  }, [id])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/admin/pages', { method: 'PUT', body: JSON.stringify(form) })
    router.push('/admin/pages')
  }

  return (
    <main className="page-pad">
      <div className="center-max">
        <Card title="Edit Page" subtitle={`ID: ${id}`}>
          {loading ? <p>Loading…</p> : (
            <form onSubmit={save} className="form-grid">
              <label>
                <div className="field-label">Slug</div>
                <input value={form.slug} onChange={e=>setForm({...form, slug: e.target.value})} className="form-input" />
              </label>
              <label>
                <div className="field-label">Title</div>
                <input value={form.title} onChange={e=>setForm({...form, title: e.target.value})} className="form-input" />
              </label>
              <label>
                <div className="field-label">Content (Markdown)</div>
                <textarea rows={12} value={form.content} onChange={e=>setForm({...form, content: e.target.value})} className="form-input" />
              </label>
              <div className="flex gap-2">
                <button className="btn-ghost" type="submit">Save</button>
                <button className="btn-ghost" type="button" onClick={()=>router.push('/admin/pages')}>Cancel</button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </main>
  )
}
