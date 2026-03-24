"use client"

import React, { useEffect, useState, useRef } from 'react'
import styles from '../admin.module.css'
import ProjectsList from '../../../components/admin/projects/ProjectsList'
import Image from 'next/image'
import createDOMPurify from 'dompurify'
import Card from '../../../components/card/card'
import { useToast } from '../../../components/toast/ToastProvider'

type AboutItem = { id: number | string; slug: string; title: string; subtitle?: string; image_path?: string; description?: string; is_published: number }
type AdminCard = AboutItem & { editLink?: string; position?: number }

export default function AdminAboutList() {
  const [items, setItems] = useState<AboutItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<(string|number)[]>([])
  const [deletedUndoBuffer, setDeletedUndoBuffer] = useState<{ items: Record<string, unknown>[] } | null>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  const [slugEdited, setSlugEdited] = useState(false)
  const [form, setForm] = useState({ slug: '', title: '', subtitle: '', image_path: '', description: '', is_published: true })
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const descRef = useRef<HTMLDivElement | null>(null)
  const [descExpanded, setDescExpanded] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const toast = useToast()
  const [creating, setCreating] = useState(false)

  const purify = typeof window !== 'undefined' ? createDOMPurify(window as unknown as Window & typeof globalThis) : null
  if (purify && typeof purify.setConfig === 'function') purify.setConfig({ FORBID_TAGS: ['script', 'style'] })

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/admin/api/pages?page=1&limit=1000')
      const data = await res.json()
      const rows: Record<string, unknown>[] = data.items || []
      const cards: AdminCard[] = []
          // Do not filter by slug here — include all pages so admins can manage any created section
          rows.forEach(rawRow => {
            try {
              const row = rawRow as Record<string, unknown>
              const rawMeta = row['metadata']
              const md = rawMeta ? (typeof rawMeta === 'string' ? JSON.parse(rawMeta as string) : rawMeta) : null
              if (md && typeof md === 'object') {
                const meta = md as Record<string, unknown>
                if (Array.isArray(meta.cards) && meta.cards.length > 0) {
                  const cardsArray = meta.cards as unknown[]
                  cardsArray.forEach((c, idx: number) => {
                    const cardObj = c as Record<string, unknown>
                    const title = (cardObj['title'] as string) || (row['title'] as string) || ''
                    const subtitle = (cardObj['subtitle'] as string) || ''
                    const image_path = (cardObj['image'] as string) || ''
                    const description = (cardObj['content'] as string) || ''
                    const position = typeof cardObj['position'] === 'number' ? (cardObj['position'] as number) : undefined
                    const is_published = typeof row['is_published'] === 'number' ? (row['is_published'] as number) : (row['is_published'] ? 1 : 0)
                    const idVal = row['id'] ?? `${idx}`
                    const slugVal = row['slug'] ?? ''
                    cards.push({ id: `${idVal}-c-${idx}`, slug: `${slugVal}#${idx}`, title, subtitle, image_path, description, is_published, editLink: `/admin/about/${row['id']}?card=${idx}`, position })
                  })
                } else {
                  // fallback to legacy named cards
                  const aboutCard = meta['aboutCard'] as Record<string, unknown> | undefined
                  const topologyCard = meta['topologyCard'] as Record<string, unknown> | undefined
                  const hamshackCard = meta['hamshackCard'] as Record<string, unknown> | undefined
                  if (aboutCard) cards.push({ id: `${row['id']}-about`, slug: `${row['slug']}#about`, title: (aboutCard['title'] as string) || (row['title'] as string) || '', subtitle: (aboutCard['subtitle'] as string) || '', image_path: (aboutCard['image'] as string) || '', description: (aboutCard['content'] as string) || '', is_published: typeof row['is_published'] === 'number' ? (row['is_published'] as number) : (row['is_published'] ? 1 : 0), editLink: `/admin/about/${row['id']}?card=0`, position: (typeof aboutCard['position'] === 'number') ? (aboutCard['position'] as number) : undefined })
                  if (topologyCard) cards.push({ id: `${row['id']}-topology`, slug: `${row['slug']}#topology`, title: (topologyCard['title'] as string) || '', subtitle: (topologyCard['subtitle'] as string) || '', image_path: (topologyCard['image'] as string) || '', description: (topologyCard['content'] as string) || '', is_published: typeof row['is_published'] === 'number' ? (row['is_published'] as number) : (row['is_published'] ? 1 : 0), editLink: `/admin/about/${row['id']}?card=1`, position: (typeof topologyCard['position'] === 'number') ? (topologyCard['position'] as number) : undefined })
                  if (hamshackCard) cards.push({ id: `${row['id']}-hamshack`, slug: `${row['slug']}#hamshack`, title: (hamshackCard['title'] as string) || '', subtitle: (hamshackCard['subtitle'] as string) || '', image_path: (hamshackCard['image'] as string) || '', description: (hamshackCard['content'] as string) || '', is_published: typeof row['is_published'] === 'number' ? (row['is_published'] as number) : (row['is_published'] ? 1 : 0), editLink: `/admin/about/${row['id']}?card=2`, position: (typeof hamshackCard['position'] === 'number') ? (hamshackCard['position'] as number) : undefined })
                }
              }
            } catch (e) {
              // ignore malformed metadata
            }
          })
      // If any cards include a saved `position`, sort globally by it so admin list reflects saved order
      const anyPosition = cards.some(c => typeof c.position === 'number')
      if (anyPosition) {
        cards.sort((a, b) => {
          const pa = (typeof a.position === 'number') ? a.position as number : Number.POSITIVE_INFINITY
          const pb = (typeof b.position === 'number') ? b.position as number : Number.POSITIVE_INFINITY
          if (pa === pb) return 0
          return pa - pb
        })
      }
      // When there are no DB-driven sections, show an empty list so admin controls content.
      if (cards.length === 0) {
        setItems([])
      } else {
        setItems(cards)
      }
    } catch (e) {
      console.error(e)
    } finally { setLoading(false) }
  }

  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t) }, [])

  async function submit(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (!form.slug || !form.title) return
    setCreating(true)
    try {
      const metadata = { aboutCard: { title: form.title, subtitle: form.subtitle, content: form.description, image: form.image_path } }
      const res = await fetch('/admin/api/pages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: form.slug, title: form.title, content: '', metadata, is_published: form.is_published ? 1 : 0 }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { alert('Create failed: ' + (j?.error || res.status)); return }
    } catch (err) { console.error(err); alert('Create failed'); return } finally { setCreating(false) }
    try { localStorage.removeItem(`admin_about_draft:${form.slug}`) } catch {}
    setForm({ slug: '', title: '', subtitle: '', image_path: '', description: '', is_published: true })
    await load()
    try { toast?.showToast && toast.showToast('Section created', 'success') } catch{}
  }

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(id)
  }, [query])

  // Ctrl/Cmd+S handler for save
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault()
        submit()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [form])

  // Draft autosave (localStorage). We avoid creating server records until user explicitly submits.
  const autosaveTimer = React.useRef<number | null>(null)
  const draftIdRef = React.useRef<string | null>(null)
  useEffect(() => { if (!draftIdRef.current) draftIdRef.current = `temp-${Date.now()}` }, [])
  const draftKey = () => `admin_about_draft:${form.slug || draftIdRef.current}`

  useEffect(() => {
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
    autosaveTimer.current = window.setTimeout(() => {
      try {
        const payload = { form, updated: Date.now() }
        try { localStorage.setItem(draftKey(), JSON.stringify(payload)) } catch {}
      } catch {}
    }, 800)
    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current) }
  }, [form])

  // Restore temp draft
  useEffect(() => {
    try {
      const key = `admin_about_draft:${draftIdRef.current}`
      const raw = localStorage.getItem(key)
      if (raw) {
        const p = JSON.parse(raw)
        if (p && p.form) {
          setForm(f => ({ ...f, ...p.form }))
          try { toast?.showToast && toast.showToast('Restored unsaved draft', 'info') } catch{}
        }
      }
    } catch {}
  }, [])

  // When slug becomes available, if there's a draft for that slug, load it
  useEffect(() => {
    if (!form.slug) return
    try {
      const key = `admin_about_draft:${form.slug}`
      const raw = localStorage.getItem(key)
      if (raw) {
        const p = JSON.parse(raw)
        if (p && p.form) setForm(f => ({ ...f, ...p.form }))
      }
    } catch {}
  }, [form.slug])

  // Keep the contentEditable DOM in sync only when the editor is not focused.
  useEffect(() => {
    try {
      if (descRef.current && document.activeElement !== descRef.current) {
        if (descRef.current.innerHTML !== (form.description || '')) {
          descRef.current.innerHTML = form.description || ''
        }
      }
    } catch {}
  }, [form.description])

  // auto-generate slug from title unless edited
  useEffect(() => {
    if (!slugEdited) {
      const s = (form.title || '').toLowerCase().trim().replace(/[^a-z0-9\s-_]/g, '').replace(/\s+/g, '-')
      setForm(f => ({ ...f, slug: s }))
    }
  }, [form.title, slugEdited])

  const filtered = items.filter(i => {
    if (!debouncedQuery) return true
    const q = debouncedQuery.toLowerCase()
    return String(i.title || '').toLowerCase().includes(q) || String(i.slug || '').toLowerCase().includes(q) || String(i.subtitle || '').toLowerCase().includes(q)
  })

  const [savingOrder, setSavingOrder] = useState(false)

  const moveItemInArray = <T,>(arr: T[], from: number, to: number): T[] => {
    const copy = arr.slice()
    const [item] = copy.splice(from, 1)
    copy.splice(to, 0, item)
    return copy
  }

  const saveOrder = async <T extends { id?: string | number }>(newItems: T[]) => {
    setSavingOrder(true)
    try {
      const order = newItems.map(i => String(i.id))
      const res = await fetch('/admin/api/pages/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { alert('Save order failed: ' + (j?.error || res.status)); return }
      try { toast?.showToast && toast.showToast('Order saved', 'success') } catch{}
    } catch (err) {
      console.error('saveOrder error', err)
      try { toast?.showToast && toast.showToast('Order save failed', 'error') } catch{}
    } finally {
      setSavingOrder(false)
      await load()
    }
  }

  const handleMoveUp = (filteredIndex: number) => {
    const item = filtered[filteredIndex]
    if (!item) return
    const globalIndex = items.findIndex(i => String(i.id) === String(item.id))
    if (globalIndex <= 0) return
    const next = moveItemInArray(items, globalIndex, globalIndex - 1)
    setItems(next)
    void saveOrder(next)
  }

  const handleMoveDown = (filteredIndex: number) => {
    const item = filtered[filteredIndex]
    if (!item) return
    const globalIndex = items.findIndex(i => String(i.id) === String(item.id))
    if (globalIndex < 0 || globalIndex >= items.length - 1) return
    const next = moveItemInArray(items, globalIndex, globalIndex + 1)
    setItems(next)
    void saveOrder(next)
  }

  const performBulkAction = async (action: 'publish' | 'unpublish' | 'delete') => {
    if (!selectedIds || selectedIds.length === 0) return
    try {
      const res = await fetch('/admin/api/pages/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selectedIds, action }) })
      const j = await res.json().catch(()=>({}))
      if (!res.ok) { alert('Bulk action failed: ' + (j?.error || res.status)); return }
      if (action === 'delete') {
        // server returns deleted rows for undo
        const deleted = j?.deleted || []
        setDeletedUndoBuffer({ items: deleted })
        // clear selection and refresh
        setSelectedIds([])
        await load()
        try { toast?.showToast && toast.showToast(`Deleted ${deleted.length} item(s) — Undo available`, 'success') } catch{}
        // auto-clear undo buffer after 10s
        setTimeout(()=> setDeletedUndoBuffer(null), 10000)
        return
      }
      await load()
      setSelectedIds([])
      try { toast?.showToast && toast.showToast('Bulk action complete', 'success') } catch{}
    } catch (e) {
      alert('Bulk action failed: ' + String(e))
    }
  }

  const undoDelete = async () => {
    if (!deletedUndoBuffer || !deletedUndoBuffer.items) return
    const itemsToRestore = deletedUndoBuffer.items
    for (const it of itemsToRestore) {
      try {
        const payload = { slug: String((it as Record<string, unknown>)['slug'] || ''), title: String((it as Record<string, unknown>)['title'] || ''), content: String((it as Record<string, unknown>)['content'] || ''), metadata: (it as Record<string, unknown>)['metadata'] || {}, is_published: (it as Record<string, unknown>)['is_published'] ? 1 : 0 }
        await fetch('/admin/api/pages', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) })
      } catch (e) { console.error('undo create failed', e) }
    }
    setDeletedUndoBuffer(null)
    await load()
    try { toast?.showToast && toast.showToast('Undo complete', 'success') } catch{}
  }

  const getErrMsg = (err: unknown) => { if (err instanceof Error) return err.message; try { return String(err) } catch { return 'Unknown error' } }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!form.slug) { alert('Please enter a slug before uploading'); return }

    const MAX_BYTES = 50 * 1024 * 1024
    if (file.size > MAX_BYTES) { alert('Main image too large (max 50MB)'); return }

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('slug', form.slug)
      fd.append('filename', file.name)
      setUploadProgress(-1)
      const direct = await fetch('/api/uploads/direct', { method: 'POST', body: fd })
      const d = await direct.json()
      if (direct.ok && d.publicUrl) {
        setForm(f => ({ ...f, image_path: d.publicUrl || d.key }))
        try { toast?.showToast && toast.showToast('Main image uploaded', 'success') } catch{}
        setUploadProgress(0)
        return
      }
    } catch (derr) { console.error('direct upload error', getErrMsg(derr)) }

    const res = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: form.slug, filename: file.name, contentType: file.type }) })
    const data = await res.json()
    if (!data.url) { alert('Upload presign failed: ' + (data.error || 'unknown')); return }

    try {
      const upload = await fetch(data.url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!upload.ok) {
        const fd = new FormData(); fd.append('file', file); fd.append('slug', form.slug); fd.append('filename', file.name)
        const direct = await fetch('/api/uploads/direct', { method: 'POST', body: fd })
        const d = await direct.json()
        if (direct.ok && d.publicUrl) { setForm(f => ({ ...f, image_path: d.publicUrl || d.key })); return }
        alert('Upload failed')
        return
      }
    } catch (err) {
      console.error('upload error', getErrMsg(err))
      try {
        const upload2 = await fetch(data.url, { method: 'PUT', body: file })
        if (!upload2.ok) { alert('Upload failed'); return }
      } catch (err2) { console.error('upload retry error', getErrMsg(err2)); alert('Upload failed: ' + getErrMsg(err2)); return }
    }

    setForm(f => ({ ...f, image_path: data.publicUrl || data.key }))
    setUploadProgress(0)
  }

  return (
    <main className="page-pad">
      <div className="center-max">
        <div className={styles.panel}>
          <h2>About Sections</h2>
          <div className="stack">
            <div className={styles.editorGrid}>
              <div>
                <form suppressHydrationWarning onSubmit={submit} className="form-grid">
                  <label>
                    <div className="field-label">Slug</div>
                    <input suppressHydrationWarning value={form.slug} onChange={e => { setSlugEdited(true); setForm({ ...form, slug: e.target.value }) }} className={styles.formInput} />
                  </label>
                  <label>
                    <div className="field-label">Title</div>
                    <input suppressHydrationWarning value={form.title} onChange={e => {
                      const title = e.target.value
                      if (!slugEdited) {
                        const s = title.toLowerCase().trim().replace(/[^a-z0-9\s-_]/g, '').replace(/\s+/g, '-')
                        setForm(f => ({ ...f, title, slug: s }))
                      } else {
                        setForm(f => ({ ...f, title }))
                      }
                    }} className={styles.formInput} />
                  </label>
                  <label>
                    <div className="field-label">Subtitle</div>
                    <input suppressHydrationWarning value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} className={styles.formInput} />
                  </label>
                  <label>
                    <div className="field-label">Image path</div>
                    <input suppressHydrationWarning value={form.image_path} onChange={e => setForm({ ...form, image_path: e.target.value })} className={styles.formInput} />
                    <div style={{ marginTop: 8 }}>
                      <label className={styles.btnGhost + ' ' + styles.btnGhostSmall} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <input suppressHydrationWarning type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                        Upload image
                      </label>
                    </div>
                  </label>
                  <label>
                    <div className="field-label">Description (HTML allowed)</div>
                    <div style={{ marginBottom: 8 }} className={styles.smallMuted}>Use the toolbar to format text; content is stored as HTML.</div>
                    <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 8, background: 'var(--card-bg)' }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('bold'); setTimeout(() => setForm(f => ({ ...f, description: descRef.current?.innerHTML || '' })), 0); }} title="Bold">B</button>
                        <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('italic'); setTimeout(() => setForm(f => ({ ...f, description: descRef.current?.innerHTML || '' })), 0); }} title="Italic">I</button>
                        <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('insertUnorderedList'); setTimeout(() => setForm(f => ({ ...f, description: descRef.current?.innerHTML || '' })), 0); }} title="Bullet list">• List</button>
                        <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('insertOrderedList'); setTimeout(() => setForm(f => ({ ...f, description: descRef.current?.innerHTML || '' })), 0); }} title="Numbered list">1. List</button>
                        <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; const url = prompt('Insert link URL'); if (url) { descRef.current.focus(); document.execCommand('createLink', false, url); setTimeout(() => setForm(f => ({ ...f, description: descRef.current?.innerHTML || '' })), 0); } }} title="Insert link">🔗</button>
                        <button type="button" className={styles.btnGhost} onClick={() => setDescExpanded(v => !v)}>⤢</button>
                      </div>
                      <div id="admin-desc-editor" ref={descRef} contentEditable suppressContentEditableWarning className={styles.formTextarea} onInput={(e: React.FormEvent<HTMLDivElement>) => { const v = (e.currentTarget as HTMLDivElement).innerHTML || ''; setForm(f => ({ ...f, description: v })); }} style={{ minHeight: descExpanded ? 400 : 220, maxHeight: 800, overflow: 'auto', resize: 'vertical' }} />
                    </div>
                  </label>

                  <div style={{ display: 'flex', gap: 2 }}>
                    <button suppressHydrationWarning className={styles.btnGhost} type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
                    <button type="button" className={styles.btnGhost} onClick={() => setPreviewOpen(true)}>Preview</button>
                    <button type="button" className={styles.btnDanger} onClick={() => { try { localStorage.removeItem(`admin_about_draft:${form.slug || draftIdRef.current}`) } catch {} ; setForm({ slug: '', title: '', subtitle: '', image_path: '', description: '', is_published: true }); try { toast?.showToast && toast.showToast('Draft discarded', 'info') } catch {} }}>Discard draft</button>
                  </div>
                </form>
              </div>

              <aside>
                <div className={styles.panel} style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div className={styles.fieldLabel}>About Sections</div>
                        <div className="muted">Total: {items.length} (published: {items.filter(i => i && Number(i.is_published) === 1).length})</div>
                    </div>
                    <div>
                      <button className={styles.btnGhost} type="button" onClick={load}>Refresh</button>
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <input placeholder="Search by title or slug" className={styles.formInput} value={query} onChange={e => { setQuery(e.target.value) }} />
                    <div className={styles.smallMuted} style={{ marginTop: 8 }}>Tip: click Edit to open section editor</div>
                    {uploadProgress < 0 ? (
                      <span style={{ display: 'block', marginTop: 8, color: '#9fb7d6' }}>Uploading…</span>
                    ) : uploadProgress > 0 ? (
                      <div style={{ display: 'block', marginTop: 8 }}>
                        <div className="progress-bar" style={{ width: 120 }}>
                          <div className="progress-bar-inner" style={{ width: `${uploadProgress}%` }} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </aside>
            </div>

            <div style={{ gridColumn: '1/-1' }}>
              <hr />
              {selectedIds && selectedIds.length > 0 ? (
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:8}}>
                  <div style={{fontWeight:700}}>{selectedIds.length} selected</div>
                  <button className={styles.btnGhost} onClick={()=>performBulkAction('publish')}>Publish</button>
                  <button className={styles.btnGhost} onClick={()=>performBulkAction('unpublish')}>Unpublish</button>
                  <button className={styles.btnDanger} onClick={()=>performBulkAction('delete')}>Delete</button>
                </div>
              ) : null}
              <ProjectsList
                items={filtered}
                loading={loading}
                title="About"
                editPathPrefix="/admin/about"
                showReorder
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                selectable={true}
                selectedIds={selectedIds}
                onSelectionChange={(ids: (string|number)[]) => setSelectedIds(ids)}
              />
              {deletedUndoBuffer ? (
                <div style={{marginTop:12, display:'flex', gap:8, alignItems:'center'}}>
                  <div className={styles.smallMuted}>Deleted {deletedUndoBuffer.items?.length || 0} item(s)</div>
                  <button className={styles.btnGhost} onClick={undoDelete}>Undo</button>
                </div>
              ) : null}
            </div>

            {previewOpen && (
              <div className={styles.modalOverlay} onClick={() => setPreviewOpen(false)}>
                <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontWeight: 700 }}>Preview</div>
                    <button className={styles.btnGhost} onClick={() => setPreviewOpen(false)}>Close</button>
                  </div>
                  <div style={{ maxWidth: 520 }}>
                    <Card title={form.title || 'Untitled'} subtitle={form.subtitle || ''}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                          <div style={{ width: 140, height: 100, background: '#061426', borderRadius: 8, overflow: 'hidden', flex: '0 0 140px' }}>
                            {form.image_path ? (
                              <Image src={String(form.image_path)} alt={form.title || ''} width={140} height={100} style={{ width: '100%', height: '100%', objectFit: 'cover' }} unoptimized />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9fb7d6' }}>No image</div>
                            )}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: 'var(--white-95)', marginBottom: 8 }} dangerouslySetInnerHTML={{ __html: ((form as Record<string, unknown>)['description_sanitized'] ?? (purify ? purify.sanitize(String(form.description || '')) : String(form.description || ''))) as string }} />
                          </div>
                      </div>
                    </Card>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </main>
  )
}
