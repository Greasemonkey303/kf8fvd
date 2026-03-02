"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useRouter } from 'next/navigation'
import styles from '../admin.module.css'

export default function PageEditor({ params }: { params: { id: string } }) {
  const id = params.id
  const router = useRouter()
  const [form, setForm] = useState({ id: 0, slug: '', title: '', content: '', is_published: false })
  const [loading, setLoading] = useState(true)

  const sanitizedHtml = useMemo(() => {
    try {
      const raw = marked.parse(form.content || '')
      return DOMPurify.sanitize(raw)
    } catch (err) {
      return ''
    }
  }, [form.content])

  const [showPreview, setShowPreview] = useState(true)

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
        <div className={styles.panel}>
          <h2>Edit Page — ID: {id}</h2>
          {loading ? <p>Loading…</p> : (
            <form onSubmit={save} className="form-grid">
              <label>
                <div className={styles.fieldLabel}>Slug</div>
                <input value={form.slug} onChange={e=>setForm({...form, slug: e.target.value})} className={styles.formInput} />
              </label>
              <label>
                <div className={styles.fieldLabel}>Title</div>
                <input value={form.title} onChange={e=>setForm({...form, title: e.target.value})} className={styles.formInput} />
              </label>
              <label>
                <div className={styles.fieldLabel}>Content (Markdown)</div>
                <textarea rows={12} value={form.content} onChange={e=>setForm({...form, content: e.target.value})} className={styles.formTextarea} />
              </label>

              <div>
                <div className="flex between items-center">
                  <div className={styles.fieldLabel}>Preview</div>
                  <label className={styles.switch + ' ' + styles.switchSmall}>
                    <input type="checkbox" checked={showPreview} onChange={e=>setShowPreview(e.target.checked)} />
                    <span className={`${styles.slider} ${showPreview ? styles.on : ''}`} />
                    <span className={styles.switchLabel}>{showPreview ? 'Shown' : 'Hidden'}</span>
                  </label>
                </div>
                {showPreview && <div className="card markdown-preview" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />}
              </div>
              <div className="flex gap-2">
                <button className={styles.btnGhost} type="submit">Save</button>
                <button className={styles.btnGhost} type="button" onClick={()=>router.push('/admin/pages')}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
