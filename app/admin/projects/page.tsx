"use client"

import React, { useEffect, useState } from 'react'
import { Card } from '@/components'

type ProjectItem = { id: number; slug: string; title: string; subtitle?: string; image_path?: string; description?: string; external_link?: string; is_published: number }

export default function AdminProjects() {
  const [items, setItems] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ slug: '', title: '', subtitle: '', image_path: '', description: '', external_link: '', is_published: true, sort_order: 0 })

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/projects')
    const data = await res.json()
    setItems(data.items || [])
    setLoading(false)
  }

  useEffect(()=>{ load() }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.slug || !form.title) return
    await fetch('/api/admin/projects', { method: 'POST', body: JSON.stringify(form) })
    setForm({ slug: '', title: '', subtitle: '', image_path: '', description: '', external_link: '', is_published: true, sort_order: 0 })
    await load()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!form.slug) { alert('Please enter a slug before uploading'); return }

    // Request presigned URL
    const res = await fetch('/api/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: form.slug, filename: file.name, contentType: file.type })
    })
    const data = await res.json()
    if (!data.url) { alert('Upload presign failed: ' + (data.error || 'unknown')); return }

    // Upload file to S3
    try {
      const upload = await fetch(data.url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!upload.ok) {
        const text = await upload.text().catch(()=>'<no body>')
        console.error('presign upload failed', upload.status, upload.statusText, text)
        // try server-side direct upload as a fallback (avoids browser CORS)
        try {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('slug', form.slug)
          fd.append('filename', file.name)
          const direct = await fetch('/api/uploads/direct', { method: 'POST', body: fd })
          const d = await direct.json()
          if (direct.ok && d.publicUrl) {
            setForm({...form, image_path: d.publicUrl || d.key})
            return
          }
          const dtext = JSON.stringify(d)
          alert('Upload failed (presign + direct): ' + upload.status + ' - ' + dtext)
          return
        } catch (derr: any) {
          console.error('direct upload error', derr)
          alert('Upload failed (presign + direct): ' + String(derr?.message || derr))
          return
        }
      }
    } catch (err: any) {
      // network/CORS error — try a safer retry without custom headers for debugging
      console.error('upload error', err)
      try {
        const upload2 = await fetch(data.url, { method: 'PUT', body: file })
        if (!upload2.ok) {
          const t2 = await upload2.text().catch(()=>'<no body>')
          console.error('presign upload retry failed', upload2.status, upload2.statusText, t2)
          // fallback to server-side direct upload
          try {
            const fd = new FormData()
            fd.append('file', file)
            fd.append('slug', form.slug)
            fd.append('filename', file.name)
            const direct = await fetch('/api/uploads/direct', { method: 'POST', body: fd })
            const d = await direct.json()
            if (direct.ok && d.publicUrl) {
              setForm({...form, image_path: d.publicUrl || d.key})
              return
            }
            alert('Upload failed (retry + direct): ' + upload2.status + ' - ' + JSON.stringify(d))
            return
          } catch (derr: any) {
            console.error('direct upload error', derr)
            alert('Upload failed (retry + direct): ' + String(derr?.message || derr))
            return
          }
        }
      } catch (err2: any) {
        console.error('upload retry error', err2)
        alert('Upload failed: ' + String(err2?.message || err2))
        return
      }
    }

    // Set image_path to returned public URL
    setForm({...form, image_path: data.publicUrl || data.key})
  }

  return (
    <main className="page-pad">
      <div className="center-max">
        <Card title="Projects" subtitle="Manage projects displayed on the site">
          <div className="stack">
            <form suppressHydrationWarning onSubmit={submit} className="form-grid">
              <label>
                <div className="field-label">Slug</div>
                <input suppressHydrationWarning value={form.slug} onChange={e=>setForm({...form, slug: e.target.value})} className="form-input" />
              </label>
              <label>
                <div className="field-label">Title</div>
                <input suppressHydrationWarning value={form.title} onChange={e=>setForm({...form, title: e.target.value})} className="form-input" />
              </label>
              <label>
                <div className="field-label">Subtitle</div>
                <input suppressHydrationWarning value={form.subtitle} onChange={e=>setForm({...form, subtitle: e.target.value})} className="form-input" />
              </label>
              <label>
                <div className="field-label">Image path</div>
                <input suppressHydrationWarning value={form.image_path} onChange={e=>setForm({...form, image_path: e.target.value})} className="form-input" />
                <input suppressHydrationWarning type="file" accept="image/*" onChange={handleFileChange} />
              </label>
              <label>
                <div className="field-label">Description (HTML allowed)</div>
                <textarea suppressHydrationWarning rows={6} value={form.description} onChange={e=>setForm({...form, description: e.target.value})} className="form-input" />
              </label>
              <label>
                <div className="field-label">External link</div>
                <input suppressHydrationWarning value={form.external_link} onChange={e=>setForm({...form, external_link: e.target.value})} className="form-input" />
              </label>
              <div className="flex gap-2">
                <button className="btn-ghost" type="submit">Create</button>
              </div>
            </form>

            <hr />

            {loading ? <p>Loading…</p> : (
              <ul className="stack">
                {items.map(i=> (
                  <li key={i.id} className="row between">
                    <div>
                      <strong>{i.title}</strong> <span className="muted">{i.subtitle}</span>
                    </div>
                    <div className="flex gap-2">
                      <a className="btn-ghost" href={`/admin/projects/${i.id}`}>Edit</a>
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
