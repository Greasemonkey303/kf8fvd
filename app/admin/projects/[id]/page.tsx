"use client"

import React, { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components'
export default function ProjectEditor({ params }: { params: any }) {
  const paramsObj = use(params)
  const id = paramsObj?.id
  const router = useRouter()
  const [form, setForm] = useState({ id: 0, slug: '', title: '', subtitle: '', image_path: '', description: '', external_link: '', is_published: true, sort_order: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    (async ()=>{
      const res = await fetch('/api/admin/projects?page=1&limit=1000')
      const data = await res.json()
      const found = (data.items || []).find((p: any)=> String(p.id) === String(id))
      if (found) setForm({ id: found.id, slug: found.slug, title: found.title, subtitle: found.subtitle || '', image_path: found.image_path || '', description: found.description || '', external_link: found.external_link || '', is_published: !!found.is_published, sort_order: found.sort_order || 0 })
      setLoading(false)
    })()
  }, [id])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/admin/projects', { method: 'PUT', body: JSON.stringify(form) })
    router.push('/admin/projects')
  }

  async function remove() {
    if (!confirm('Delete this project?')) return
    await fetch(`/api/admin/projects?id=${form.id}`, { method: 'DELETE' })
    router.push('/admin/projects')
  }

  return (
    <main className="page-pad">
      <div className="center-max">
        <Card title="Edit Project" subtitle={`ID: ${id}`}>
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
                <div className="field-label">Subtitle</div>
                <input value={form.subtitle} onChange={e=>setForm({...form, subtitle: e.target.value})} className="form-input" />
              </label>
              <label>
                <div className="field-label">Image path</div>
                <input value={form.image_path} onChange={e=>setForm({...form, image_path: e.target.value})} className="form-input" />
              </label>
              <label>
                <div className="field-label">Description (HTML allowed)</div>
                <textarea rows={8} value={form.description} onChange={e=>setForm({...form, description: e.target.value})} className="form-input" />
              </label>
              <label>
                <div className="field-label">External link</div>
                <input value={form.external_link} onChange={e=>setForm({...form, external_link: e.target.value})} className="form-input" />
              </label>
              <label>
                <div className="field-label">Published</div>
                <input type="checkbox" checked={form.is_published} onChange={e=>setForm({...form, is_published: e.target.checked})} />
              </label>
              <div className="flex gap-2">
                <button className="btn-ghost" type="submit">Save</button>
                <button className="btn-ghost" type="button" onClick={()=>router.push('/admin/projects')}>Cancel</button>
                <button className="btn-danger" type="button" onClick={remove}>Delete</button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </main>
  )
}
