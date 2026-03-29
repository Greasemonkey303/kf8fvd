"use client"

import React, { useEffect, useState, useRef } from 'react'
import styles from '../../admin.module.css'
import Card from '../../../../components/card/card'
import AdminNotice from '@/components/admin/AdminNotice'
import AdminObjectImage from '@/components/admin/AdminObjectImage'
import Modal from '@/components/modal/Modal'
import RichTextEditor from '@/components/admin/RichTextEditor'

type Hero = { id?: number; title?: string; subtitle?: string; content?: string }
type HeroImage = { id?: number; url?: string; alt?: string; is_featured?: number }

export default function AdminHeroPage() {
  const [hero, setHero] = useState<Hero | null>(null)
  const [images, setImages] = useState<HeroImage[]>([])
  const [, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null)
  const autosaveTimer = useRef<number | null>(null)
  const draftKeyRef = useRef<string>('admin_hero_draft:new')
  const [hasDraft, setHasDraft] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingAlt, setEditingAlt] = useState<string>('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/admin/api/hero')
      const j = await res.json()
      const item = Array.isArray(j.items) && j.items.length ? j.items[0] : null
      setHero(item)
      if (item) {
        const r2 = await fetch(`/api/hero`)
        const j2 = await r2.json()
        setImages(Array.isArray(j2.images) ? (j2.images as HeroImage[]) : [])
      } else {
        setImages([])
      }
    } catch (e) {
      console.error('load hero error', e)
      setError(e instanceof Error ? e.message : 'Failed to load hero content')
    }
    setLoading(false)
  }

  // Ensure we fetch hero + images when the admin page mounts so reloads show current data
  useEffect(() => {
    load()
  }, [])
  
  // When hero changes (id becomes available), update draft key
  useEffect(()=>{
    if (hero && hero.id) {
      draftKeyRef.current = `admin_hero_draft:${hero.id}`
      try {
        const raw = localStorage.getItem(draftKeyRef.current)
        if (raw) {
          // do not auto-apply draft, but surface notification by setting draftSavedAt
          const d = JSON.parse(raw)
          if (d && d.updated) setDraftSavedAt(d.updated)
          setHasDraft(true)
        }
      } catch {}
    }
  }, [hero])

  async function save(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (!hero) return
    setSaving(true)
    try {
      const payload = { id: hero.id, title: hero.title, subtitle: hero.subtitle, content: hero.content }
      await fetch('/admin/api/hero', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      await load()
    } catch (err) { console.error('save hero error', err) }
    setSaving(false)
  }

  async function createHero() {
    setSaving(true)
    try {
      const payload = { title: 'New Hero', subtitle: '', content: '' }
      const res = await fetch('/admin/api/hero', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json()
      setHero(j.item)
      await load()
    } catch (e) { console.error('create hero error', e) }
    setSaving(false)
  }

  async function handleFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    if (!file || !hero) return
    setError(null)
    // generate deterministic key under hero/<hero.id>/ to ensure correct folder
    const sanitize = (n = '') => String(n).replace(/[^a-zA-Z0-9._-]/g, '_')
    const ts = Date.now()
    const clean = sanitize(file.name)
    const key = `hero/${hero.id}/${ts}-${clean}`
    try {
      setUploading(true)
      setUploadProgress(0)
      setUploadSuccess(false)
      // include file size and contentType for server-side validation
      const pres = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, contentType: file.type, size: file.size }) })
      const pd = await pres.json()
      if (pd?.error) throw new Error(String(pd.error))
      if (!pd?.url) throw new Error('Presign failed: no url returned')

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', pd.url)
        try { xhr.setRequestHeader('Content-Type', file.type) } catch {}
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 100)
            setUploadProgress(pct)
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error('Upload failed: ' + xhr.status))
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(file)
      })

      const storedKey = pd.key || key
      // record in DB (store the object key, not a presigned URL)
      // auto-feature if no featured exists
      const currentlyHasFeatured = images.find(i => Number(i.is_featured) === 1)
      const shouldFeature = !currentlyHasFeatured
      await fetch('/admin/api/hero/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hero_id: hero.id, url: storedKey, alt: file.name, is_featured: shouldFeature ? 1 : 0 }) })
      setUploadSuccess(true)
      setTimeout(()=> setUploadSuccess(false), 2500)
      setUploadProgress(100)
      await load()
    } catch (err) {
      console.error('upload hero image error', err)
      setError('Upload failed: ' + String(err))
    } finally {
      setUploading(false)
      setUploadProgress(null)
    }
  }

  async function updateImageMeta(id: number, alt: string) {
    try {
      await fetch('/admin/api/hero/image', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, alt }) })
      await load()
    } catch (e) { console.error('updateImageMeta error', e) }
  }

  // Autosave hero draft to localStorage
  useEffect(()=>{
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
    autosaveTimer.current = window.setTimeout(()=>{
      try {
        const payload = { hero: hero || null, updated: Date.now() }
        localStorage.setItem(draftKeyRef.current, JSON.stringify(payload))
        setDraftSavedAt(Date.now())
        setHasDraft(true)
      } catch (e) { console.error('autosave error', e) }
    }, 700)
    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current) }
  }, [hero])

  async function setFeaturedImage(id: number) {
    try {
      await fetch('/admin/api/hero/image', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, set_featured: true }) })
      await load()
    } catch (e) { console.error(e) }
  }

  async function deleteImage(id: number) {
    const res = await fetch(`/admin/api/hero/image?id=${encodeURIComponent(String(id))}`, { method: 'DELETE' })
    if (!res.ok) {
      let msg = `Delete failed: ${res.status} ${res.statusText}`
      try {
        const j = await res.json()
        if (j?.error) msg = String(j.error)
        else if (j?.message) msg = String(j.message)
      } catch {}
      throw new Error(msg)
    }
    await load()
    return true
  }

  // state for delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; url?: string; alt?: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [ariaMessage, setAriaMessage] = useState<string>('')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function confirmDelete() {
    if (!deleteTarget) return
    setAriaMessage('Deleting image…')
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteImage(deleteTarget.id)
      setAriaMessage('Image deleted')
      setDeleteTarget(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('confirmDelete error', err)
      setDeleteError(msg)
      setAriaMessage('Delete failed')
    }
    setDeleting(false)
    setTimeout(() => setAriaMessage(''), 2200)
  }

  return (
    <main className={styles.pageBody}>
          {error ? <AdminNotice message={error} variant="error" actionLabel="Retry" onAction={() => { void load() }} /> : null}
          <div className={styles.adminTop}>
            <div>
              <h2 className="title">Home — Hero</h2>
              <div className={styles.smallMuted}>Manage the homepage hero image and text</div>
            </div>
            <div className={styles.topActionsInner}>
              <button className={styles.btnGhost} onClick={load}>Refresh</button>
              {!hero ? <button className={styles.btnGhost} onClick={createHero}>Create hero</button> : <button className={styles.btnGhost} onClick={save} disabled={saving}>{saving ? (<span className={styles.rowCenter8}><span className={styles.spinner} />Saving...</span>) : 'Save'}</button>}
              <div className={styles.columnEnd8}>
                <div className={styles.rowCenter8}>
                  <div className={styles.smallMutedTight}>{draftSavedAt ? `Draft saved ${Math.round((Date.now()-draftSavedAt)/1000)}s ago` : 'No draft'}</div>
                  {hasDraft && <button className={styles.btnGhostSmall} onClick={() => {
                    try {
                      const raw = localStorage.getItem(draftKeyRef.current)
                      if (!raw) return
                      const p = JSON.parse(raw)
                      if (p && p.hero) setHero(p.hero)
                      setDraftSavedAt(p.updated || Date.now())
                      // keep draft flag
                    } catch (e) { console.error('restore draft error', e) }
                  }}>Restore</button>}
                  {hasDraft && <button className={styles.btnGhostSmall} onClick={() => {
                    try { localStorage.removeItem(draftKeyRef.current); setHasDraft(false); setDraftSavedAt(null) } catch(e) { console.error(e) }
                  }}>Clear draft</button>}
                </div>
                {uploading && <div className={styles.smallMuted}>Uploading... {uploadProgress != null ? uploadProgress + '%' : ''}</div>}
                {uploadSuccess && <div className={styles.uploadSuccess}>Upload success</div>}
              </div>
            </div>
          </div>

          <div className={styles.editorSplit}>
            <div className={styles.editorMain}>
              <label>
                <div className="field-label">Title</div>
                <input suppressHydrationWarning value={hero?.title || ''} onChange={e=>setHero(h=>({ ...(h||{}), title: e.target.value }))} className={styles.formInput} />
              </label>
              <label>
                <div className="field-label">Subtitle</div>
                <input suppressHydrationWarning value={hero?.subtitle || ''} onChange={e=>setHero(h=>({ ...(h||{}), subtitle: e.target.value }))} className={styles.formInput} />
              </label>
              <div>
                <div className="field-label">Content</div>
                <RichTextEditor
                  value={hero?.content || ''}
                  onChange={(nextValue) => setHero(currentHero => ({ ...(currentHero || {}), content: nextValue }))}
                  placeholder="Write the hero copy, add emphasis, links, or supporting details."
                  minHeight={220}
                  expandedMinHeight={420}
                />
              </div>
            </div>
            <div className={styles.editorSidebar}>
              <Card>
                <div className={styles.draftHeaderRow}>
                  <div className={styles.draftTitleBold}>Images</div>
                </div>
                <div className={styles.stack12}>
                  {/* Featured image section */}
                  {(() => {
                    const featured = images.find((i) => Number(i.is_featured) === 1)
                    const others = images.filter((i) => Number(i.is_featured) !== 1)
                    return (
                      <div>
                        {featured ? (
                          <div className={styles.stack12}>
                            <div className={styles.draftTitleBold}>Featured</div>
                            <div className={styles.mediaFrameLarge}>
                              <AdminObjectImage src={featured?.url} alt={featured?.alt||''} width={320} height={180} fallbackLabel="Featured image" />
                            </div>
                            <div className={styles.rowCenter8}>
                              <button className={styles.btnGhostSmall} onClick={() => setDeleteTarget({ id: Number(featured?.id ?? 0), url: featured?.url, alt: featured?.alt })}>Delete</button>
                              {editingId === featured?.id ? (
                                <div className={styles.rowCenter8}>
                                  <input value={editingAlt} onChange={e=>setEditingAlt(e.target.value)} className={`${styles.formInput} ${styles.imageMetaInputWide}`} />
                                  <button className={styles.btnGhostSmall} onClick={() => { updateImageMeta(Number(featured?.id ?? 0), editingAlt); setEditingId(null) }}>Save</button>
                                  <button className={styles.btnGhostSmall} onClick={() => { setEditingId(null); setEditingAlt('') }}>Cancel</button>
                                </div>
                              ) : (
                                <button className={styles.btnGhostSmall} onClick={() => { setEditingId(typeof featured?.id === 'number' ? (featured?.id as number) : null); setEditingAlt(featured?.alt || '') }}>Edit alt</button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className={styles.smallMuted}>No featured image set.</div>
                        )}

                        <div className={styles.stack8}>
                          <div className={styles.draftTitleBold}>Other images</div>
                          <div className={styles.imgGallery}>
                            {others.map((img: HeroImage) => (
                              <div key={String(img.id)} className={styles.mediaCard}>
                                <div className={styles.mediaFrameSmall}>
                                  <AdminObjectImage src={img.url} alt={img.alt||''} width={120} height={80} fallbackLabel="Hero image" />
                                </div>
                                <div className={styles.rowCenter8}>
                                  <button className={styles.btnGhostSmall} onClick={()=>setFeaturedImage(Number(img.id ?? 0))}>Feature</button>
                                  <button className={styles.btnGhostSmall} onClick={()=>setDeleteTarget({ id: Number(img.id ?? 0), url: img.url, alt: img.alt })}>Delete</button>
                                  {editingId === img.id ? (
                                    <div className={styles.rowCenter8}>
                                      <input value={editingAlt} onChange={e=>setEditingAlt(e.target.value)} className={`${styles.formInput} ${styles.imageMetaInputNarrow}`} />
                                      <button className={styles.btnGhostSmall} onClick={() => { updateImageMeta(Number(img.id ?? 0), editingAlt); setEditingId(null) }}>Save</button>
                                      <button className={styles.btnGhostSmall} onClick={() => { setEditingId(null); setEditingAlt('') }}>Cancel</button>
                                    </div>
                                  ) : (
                                    <button className={styles.btnGhostSmall} onClick={() => { setEditingId(typeof img.id === 'number' ? img.id : null); setEditingAlt(img.alt || '') }}>Edit alt</button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                  <div className={styles.stack8}>
                    <label className={`${styles.btnGhost} ${styles.btnGhostSmall}`}>
                      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className={styles.srOnlyInput} />
                      Upload image
                    </label>
                    <div className={styles.smallMuted}>Uploaded images will be stored and can be featured.</div>

                    {(uploading || uploadProgress !== null) && (
                      <div className={styles.uploadWrapper}>
                        <progress className={styles.progressNative} max={100} value={uploadProgress ?? 0} aria-label="Hero image upload progress" />
                        <div className={styles.uploadInfoRow}>
                          <div className={styles.uploadPercent}>{uploadProgress != null ? `${uploadProgress}%` : 'Uploading…'}</div>
                          <div className={styles.smallMuted}>{uploadSuccess ? 'Ready' : 'Uploading...'}</div>
                        </div>
                      </div>
                    )}
                          {/* Delete confirmation modal */}
                          {deleteTarget && (
                            <Modal overlayClassName={styles.modalOverlay} contentClassName={styles.modalContent} onClose={() => { setDeleteTarget(null); setDeleteError(null); }} initialFocusRef={deleteCancelRef as unknown as React.RefObject<HTMLElement>} titleId="delete-image-title">
                              <div className={styles.rowBetween12}>
                                <h4 id="delete-image-title" className={styles.titleReset}>Delete image</h4>
                                <div>
                                  <button className={styles.btnGhostSmall} onClick={() => { setDeleteTarget(null); setDeleteError(null); }} aria-label="Close">Close</button>
                                </div>
                              </div>
                              <p className={styles.smallMuted}>Are you sure you want to delete this image? This action cannot be undone.</p>
                              <div className={`${styles.rowCenter12} ${styles.sectionSpacing}`}>
                                <div className={styles.modalMediaPreview}>
                                  <AdminObjectImage src={deleteTarget.url} alt={deleteTarget.alt || ''} width={120} height={80} fallbackLabel="Delete image" />
                                </div>
                                <div className={styles.previewCopy}>
                                  <div className={styles.titleStrong}>{deleteTarget.alt || 'Untitled image'}</div>
                                  <div className={`${styles.smallMuted} ${styles.mt6}`}>This will remove the image from the hero images list and delete the object from storage.</div>
                                  {deleteError && <div role="alert" className={`${styles.modalError} ${styles.mt6}`}>{deleteError}</div>}
                                </div>
                              </div>
                              <div className={`${styles.rowEnd8} ${styles.sectionSpacing}`}>
                                <button ref={deleteCancelRef} className={styles.btnGhost} onClick={() => { setDeleteTarget(null); setDeleteError(null); }} disabled={deleting}>Cancel</button>
                                <button className={styles.btnDanger} onClick={confirmDelete} disabled={deleting}>{deleting ? (<span className={styles.rowCenter8}><span className={styles.spinner} />Deleting…</span>) : 'Delete'}</button>
                              </div>
                            </Modal>
                          )}

                          {/* ARIA live region for announcements */}
                          <div role="status" aria-live="polite" aria-atomic="true" className="sr-offscreen">{ariaMessage}</div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
    </main>
  )
}
