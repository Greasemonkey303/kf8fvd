"use client"

import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import styles from '../admin.module.css'

type PageItem = { id: number; slug: string; title: string; is_published: number }

export default function AdminPages() {
  const [pages, setPages] = useState<PageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ id: 0, slug: '', title: '', content: '', is_published: false })

  async function load(p = 1) {
    setLoading(true)
    const res = await fetch(`/admin/api/pages?page=${p}&limit=20`)
    const data = await res.json()
    setPages(data.items || [])
    setLoading(false)
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.slug || !form.title) return
    if (form.id) {
      await fetch('/admin/api/pages', { method: 'PUT', body: JSON.stringify(form) })
    } else {
      await fetch('/admin/api/pages', { method: 'POST', body: JSON.stringify(form) })
    }
    setForm({ id: 0, slug: '', title: '', content: '', is_published: false })
    await load()
  }

  async function remove(id: number) {
    if (!confirm('Delete this page?')) return
    await fetch('/admin/api/pages?id=' + id, { method: 'DELETE' })
    await load()
  }

  return (
    <main className="page-pad">
      <div className="center-max">
        <div className={styles.panel}>
          <h2>Pages</h2>
          <div className="stack">
            <form onSubmit={submit} className="form-grid" suppressHydrationWarning>
              <label>
                <div className={styles.fieldLabel}>Slug</div>
                <input suppressHydrationWarning value={form.slug} onChange={e=>setForm({...form, slug: e.target.value})} className={styles.formInput} />
              </label>
              <label>
                <div className={styles.fieldLabel}>Title</div>
                <input suppressHydrationWarning value={form.title} onChange={e=>setForm({...form, title: e.target.value})} className={styles.formInput} />
              </label>
              <div>
                <div className={styles.fieldLabel}>Published</div>
                <label className={styles.switch + ' ' + styles.switchSmall}>
                  <input suppressHydrationWarning type="checkbox" checked={form.is_published} onChange={e=>setForm({...form, is_published: e.target.checked})} />
                  <span className={`${styles.slider} ${form.is_published ? styles.on : ''}`} />
                  <span className={styles.switchLabel}>{form.is_published ? 'Published' : 'Draft'}</span>
                </label>
              </div>
              <div className="flex justify-end mt-4">
                <button className={styles.btnGhost} type="submit">Save</button>
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
                        <Link className={styles.btnGhost} href={`/admin/pages/${p.id}`}>Edit</Link>
                        <button className={styles.btnGhost} onClick={()=>remove(p.id)}>Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button className={styles.btnGhost} onClick={()=>load(1)}>First</button>
                  <button className={styles.btnGhost} onClick={()=>load()}>Refresh</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
