"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import RichTextEditor from '@/components/admin/RichTextEditor'

type DOMPurifyWithConfig = typeof DOMPurify & {
  setConfig?: (config: { FORBID_TAGS: string[] }) => void
}

// Ensure client-side DOMPurify forbids <script> and <style> tags
try {
  const purifier = DOMPurify as DOMPurifyWithConfig
  if (typeof purifier.setConfig === 'function') purifier.setConfig({ FORBID_TAGS: ['script', 'style'] })
} catch {}
import { useRouter } from 'next/navigation'
import styles from '../../admin.module.css'

function isProbablyHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

function renderPagePreviewHtml(value: string) {
  const rawValue = String(value || '')
  if (!rawValue.trim()) return ''
  try {
    if (isProbablyHtml(rawValue)) {
      return DOMPurify.sanitize(rawValue)
    }
    const rendered = marked.parse(rawValue)
    return DOMPurify.sanitize(typeof rendered === 'string' ? rendered : '')
  } catch {
    return ''
  }
}

export default function PageEditor({ params }: { params: { id: string } }) {
  const id = params.id
  const router = useRouter()
  const [form, setForm] = useState({ id: 0, slug: '', title: '', content: '', is_published: false })
  const [loading, setLoading] = useState(true)

  const sanitizedHtml = useMemo(() => {
    return renderPagePreviewHtml(form.content)
  }, [form.content])

  const [showPreview, setShowPreview] = useState(true)

  useEffect(() => {
    (async () => {
      const res = await fetch('/admin/api/pages?page=1&limit=1000')
      const data = await res.json()
      const found = (data.items || []).find((p: unknown) => String((p as Record<string, unknown>).id) === String(id))
      if (found) {
        const ff = found as Record<string, unknown>
        setForm({ id: Number(ff.id as number) || 0, slug: String(ff.slug || ''), title: String(ff.title || ''), content: String(ff.content || ''), is_published: !!ff.is_published })
      }
      setLoading(false)
    })()
  }, [id])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/admin/api/pages', { method: 'PUT', body: JSON.stringify(form) })
    router.push('/admin/pages')
  }

  return (
    <main className={styles.pageBody}>
          <div className={styles.pageHeader}>
            <div className={styles.pageTitleGroup}>
              <h2 className={styles.pageTitle}>Edit Page</h2>
              <div className={styles.pageSubtitle}>Editing page ID: {id}</div>
            </div>
          </div>
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
              <div>
                <div className={styles.fieldLabel}>Content</div>
                <RichTextEditor
                  value={form.content}
                  onChange={(nextValue) => setForm({ ...form, content: nextValue })}
                  placeholder="Write the page content visually. Legacy Markdown is still supported when loading older content."
                  minHeight={280}
                  expandedMinHeight={520}
                />
                <div className={styles.smallMuted} style={{ marginTop: 8 }}>
                  Existing Markdown content still previews correctly, and new edits can use the full rich editor.
                </div>
              </div>

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
    </main>
  )
}
