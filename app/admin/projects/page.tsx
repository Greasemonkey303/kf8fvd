"use client"

import React, { useEffect, useState, useRef } from 'react'
import styles from '../admin.module.css'
import ProjectsList from '../../../components/admin/projects/ProjectsList'
import Card from '../../../components/card/card'
import { useToast } from '../../../components/toast/ToastProvider'
import createDOMPurify from 'dompurify'

type ProjectItem = { id: number; slug: string; title: string; subtitle?: string; image_path?: string; description?: string; external_link?: string; is_published: number }

export default function AdminProjects() {
  const [items, setItems] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  const [slugEdited, setSlugEdited] = useState(false)
  const [form, setForm] = useState({ slug: '', title: '', subtitle: '', image_path: '', description: '', external_link: '', is_published: true, sort_order: 0, createDetails: false, details: '' })
  const [detailImages, setDetailImages] = useState<string[]>([])
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const descRef = useRef<HTMLDivElement | null>(null)
  const detailsRef = useRef<HTMLDivElement | null>(null)
  const [descExpanded, setDescExpanded] = useState(false)
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/projects')
    const data = await res.json()
    setItems(data.items || [])
    setLoading(false)
  }

  useEffect(()=>{ load() }, [])
  const toast = useToast()
  const purify = typeof window !== 'undefined' ? createDOMPurify(window as any) : null

  const getErrMsg = (err: unknown) => {
    if (err instanceof Error) return err.message
    try { return String(err) } catch { return 'Unknown error' }
  }

  async function submit(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (!form.slug || !form.title) return
    const metadata = form.createDetails ? { details: form.details, images: detailImages } : undefined
    try {
      await fetch('/api/admin/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, metadata }) })
    } catch (err: unknown) {
      console.error('project create error', getErrMsg(err))
      return
    }
    // clear any saved draft for this slug
    try { localStorage.removeItem(`admin_project_draft:${form.slug}`) } catch (err: unknown) { console.error('localStorage remove error', getErrMsg(err)) }
    setForm({ slug: '', title: '', subtitle: '', image_path: '', description: '', external_link: '', is_published: true, sort_order: 0, createDetails: false, details: '' })
    setDetailImages([])
    await load()
    try { toast?.showToast && toast.showToast('Project created', 'success') } catch (err: unknown) { console.error('toast error', getErrMsg(err)) }
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
        // call submit handler (form submit)
        submit()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [form, detailImages])

  // Debounced autosave to server when slug exists
  const autosaveTimer = React.useRef<number | null>(null)
  // Draft autosave (localStorage). We avoid creating server records until user explicitly submits.
  const draftIdRef = React.useRef<string>(`temp-${Date.now()}`)
  const draftKey = () => `admin_project_draft:${form.slug || draftIdRef.current}`

  useEffect(() => {
    // debounce localStorage writes
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
    autosaveTimer.current = window.setTimeout(() => {
      try {
        const payload = { form, detailImages, updated: Date.now() }
        try { localStorage.setItem(draftKey(), JSON.stringify(payload)) } catch (e) {}
        // lightweight toast for autosave
        try { toast?.showToast && toast.showToast('Draft saved locally', 'info') } catch(e){}
      } catch (e) {}
    }, 800)
    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current) }
  }, [form, detailImages])

  // On mount, restore any temp draft (when slug not yet set)
  useEffect(()=>{
    try {
      const key = `admin_project_draft:${draftIdRef.current}`
      const raw = localStorage.getItem(key)
      if (raw) {
        const p = JSON.parse(raw)
        if (p && p.form) {
          setForm(f=>({ ...f, ...p.form }))
          setDetailImages(p.detailImages || [])
          try { toast?.showToast && toast.showToast('Restored unsaved draft', 'info') } catch(e){}
        }
      }
    } catch (e) {}
  }, [])

  // When slug becomes available, if there's a draft for that slug, load it
  useEffect(()=>{
    if (!form.slug) return
    try {
      const key = `admin_project_draft:${form.slug}`
      const raw = localStorage.getItem(key)
      if (raw) {
        const p = JSON.parse(raw)
        if (p && p.form) {
          setForm(f=>({ ...f, ...p.form }))
          setDetailImages(p.detailImages || [])
          try { toast?.showToast && toast.showToast('Loaded draft for slug', 'info') } catch(e){}
        }
      }
    } catch (e) {}
  }, [form.slug])

  // Keep the contentEditable DOM in sync only when the editor is not focused.
  // This avoids React re-setting innerHTML on every render which moves the caret to start.
  useEffect(() => {
    try {
      if (descRef.current && document.activeElement !== descRef.current) {
        if (descRef.current.innerHTML !== (form.description || '')) {
          descRef.current.innerHTML = form.description || ''
        }
      }
    } catch (e) {}
  }, [form.description])

  useEffect(() => {
    try {
      if (detailsRef.current && document.activeElement !== detailsRef.current) {
        if (detailsRef.current.innerHTML !== (form.details || '')) {
          detailsRef.current.innerHTML = form.details || ''
        }
      }
    } catch (e) {}
  }, [form.details])

  // Derived filtered items for client-side search (debounced)
  const filtered = items.filter(i => {
    if (!debouncedQuery) return true
    const q = debouncedQuery.toLowerCase()
    return String(i.title || '').toLowerCase().includes(q) || String(i.slug || '').toLowerCase().includes(q) || String(i.subtitle || '').toLowerCase().includes(q)
  })

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!form.slug) { alert('Please enter a slug before uploading'); return }

    // enforce 50MB limit for main image
    const MAX_BYTES = 50 * 1024 * 1024
    if (file.size > MAX_BYTES) { alert('Main image too large (max 50MB)'); return }

    // Prefer server-side direct upload to avoid CORS issues with browser->MinIO in some environments.
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('slug', form.slug)
      fd.append('filename', file.name)
      // indicate upload started
      setUploadProgress(-1)
      const direct = await fetch('/api/uploads/direct', { method: 'POST', body: fd })
      const d = await direct.json()
      if (direct.ok && d.publicUrl) {
        setForm({...form, image_path: d.publicUrl || d.key})
        try { toast?.showToast && toast.showToast('Main image uploaded', 'success') } catch(e){}
        setUploadProgress(0)
        return
      }
      console.error('direct upload failed', direct.status, d)
      // fall through to presigned flows below
    } catch (derr: unknown) {
      console.error('direct upload error', getErrMsg(derr))
    }

    // 2) Request presigned PUT URL
    const res = await fetch('/api/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: form.slug, filename: file.name, contentType: file.type })
    })
    const data = await res.json()
    if (!data.url) { alert('Upload presign failed: ' + (data.error || 'unknown')); return }

    // Upload file to S3 (PUT)
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
        } catch (derr: unknown) {
          console.error('direct upload error', getErrMsg(derr))
          alert('Upload failed (presign + direct): ' + getErrMsg(derr))
          return
        }
      }
    } catch (err: unknown) {
      // network/CORS error — try a safer retry without custom headers for debugging
      console.error('upload error', getErrMsg(err))
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
            } catch (derr: unknown) {
            console.error('direct upload error', getErrMsg(derr))
            alert('Upload failed (retry + direct): ' + getErrMsg(derr))
          }
        }
      } catch (err2: unknown) {
        console.error('upload retry error', getErrMsg(err2))
        alert('Upload failed: ' + getErrMsg(err2))
        return
      }
    }

    // Set image_path to returned public URL
    setForm({...form, image_path: data.publicUrl || data.key})
    setUploadProgress(0)
  }

  // Upload multiple files for details images with progress and limits
  function uploadDetailFiles(files: FileList | null) {
    if (!files) return
    const MAX_ADD = Math.max(0, 6 - detailImages.length)
    const toAdd = Array.from(files).slice(0, MAX_ADD)
    const MAX_BYTES = 50 * 1024 * 1024 // 50MB

    const uploadOne = (file: File) => new Promise<void>((resolve, reject) => {
      if (file.size > MAX_BYTES) return reject(new Error('File too large (max 50MB)'))
      const fd = new FormData()
      fd.append('file', file)
      fd.append('slug', form.slug || `project-${Date.now()}`)
      fd.append('filename', file.name)
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/uploads/direct')
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
      }
      xhr.onload = () => {
        try {
          const res = JSON.parse(xhr.responseText)
          if (xhr.status >= 200 && xhr.status < 300) {
            const url = res.publicUrl || res.key
                setDetailImages(prev => [...prev.slice(0,5), url])
                try { toast.showToast && toast.showToast('Detail image uploaded', 'success') } catch(e){}
            setUploadProgress(0)
            resolve()
          } else {
            reject(new Error(res.error || 'Upload failed'))
          }
        } catch (e) { reject(e) }
      }
      xhr.onerror = () => reject(new Error('Network error'))
      xhr.send(fd)
    })

    ;(async ()=>{
      for (const f of toAdd) {
        try { await uploadOne(f) } catch (e: unknown) { alert('Upload error: ' + getErrMsg(e)); break }
      }
    })()
  }

  return (
    <main className="page-pad">
      <div className="center-max">
        <div className={styles.panel}>
          <h2>Projects</h2>
          <div className="stack">
            <div className={styles.editorGrid}>
              <div>
                <form suppressHydrationWarning onSubmit={submit} className="form-grid">
              <label>
                <div className="field-label">Slug</div>
                <input suppressHydrationWarning value={form.slug} onChange={e=>setForm({...form, slug: e.target.value})} className={styles.formInput} />
              </label>
              <label>
                <div className="field-label">Title</div>
                <input suppressHydrationWarning value={form.title} onChange={e=>{
                  const title = e.target.value
                  // auto-generate slug from title unless user edited slug manually
                  if (!slugEdited) {
                    const s = title.toLowerCase().trim().replace(/[^a-z0-9\s-_]/g, '').replace(/\s+/g, '-')
                    setForm(f=>({ ...f, title, slug: s }))
                  } else {
                    setForm(f=>({ ...f, title }))
                  }
                }} className={styles.formInput} />
              </label>
              <label>
                <div className="field-label">Subtitle</div>
                <input suppressHydrationWarning value={form.subtitle} onChange={e=>setForm({...form, subtitle: e.target.value})} className={styles.formInput} />
              </label>
              <label>
                <div className="field-label">Image path</div>
                <input suppressHydrationWarning value={form.image_path} onChange={e=>setForm({...form, image_path: e.target.value})} className={styles.formInput} />
                <div style={{marginTop:8}}>
                  <label className={styles.btnGhost + ' ' + styles.btnGhostSmall} style={{display:'inline-flex', alignItems:'center', gap:8}}>
                    <input suppressHydrationWarning type="file" accept="image/*" onChange={handleFileChange} style={{display:'none'}} />
                      
                    Upload image
                  </label>
                </div>
              </label>
              <label>
                <div className="field-label">Description (HTML allowed)</div>
                <div style={{marginBottom:8}} className={styles.smallMuted}>Use the toolbar to format text; content is stored as HTML.</div>
                <div style={{border:'1px solid rgba(255,255,255,0.06)', borderRadius:8, padding:8, background: 'var(--card-bg)'}}>
                  <div style={{display:'flex', gap:8, marginBottom:8}}>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('bold'); setTimeout(()=>setForm(f=>({...f, description: descRef.current?.innerHTML || ''})), 0); }} title="Bold">B</button>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('italic'); setTimeout(()=>setForm(f=>({...f, description: descRef.current?.innerHTML || ''})), 0); }} title="Italic">I</button>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('insertUnorderedList'); setTimeout(()=>setForm(f=>({...f, description: descRef.current?.innerHTML || ''})), 0); }} title="Bullet list">• List</button>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('insertOrderedList'); setTimeout(()=>setForm(f=>({...f, description: descRef.current?.innerHTML || ''})), 0); }} title="Numbered list">1. List</button>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; const url = prompt('Insert link URL'); if (url) { descRef.current.focus(); document.execCommand('createLink', false, url); setTimeout(()=>setForm(f=>({...f, description: descRef.current?.innerHTML || ''})), 0); } }} title="Insert link">🔗</button>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('undo'); setTimeout(()=>setForm(f=>({...f, description: descRef.current?.innerHTML || ''})), 0); }} title="Undo">↶</button>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('redo'); setTimeout(()=>setForm(f=>({...f, description: descRef.current?.innerHTML || ''})), 0); }} title="Redo">↷</button>
                    <button type="button" className={styles.btnGhost} onClick={() => setDescExpanded(v=>!v)}>⤢</button>
                  </div>
                  <div id="admin-desc-editor" ref={descRef} contentEditable suppressContentEditableWarning className={styles.formTextarea} onInput={(e: React.FormEvent<HTMLDivElement>)=>{ const v = (e.currentTarget as HTMLDivElement).innerHTML || ''; setForm(f=>({...f, description: v})); }} style={{minHeight: descExpanded ? 400 : 220, maxHeight:800, overflow:'auto', resize:'vertical'}} />
                  <div style={{display:'flex', justifyContent:'space-between', marginTop:8}}>
                    <div className={styles.smallMuted}>{(form.description || '').replace(/<[^>]+>/g,'').length} chars</div>
                    <div className={styles.smallMuted}>{((form.description || '').replace(/<[^>]+>/g,'').trim().split(/\s+/).filter(Boolean)).length} words</div>
                  </div>
                </div>
              </label>
              <label>
                <div className="field-label">External link</div>
                <input suppressHydrationWarning value={form.external_link} onChange={e=>setForm({...form, external_link: e.target.value})} className={styles.formInput} />
              </label>
              <div>
                <div className="field-label">Create details page</div>
                <label className={styles.switch + ' ' + styles.switchSmall}>
                  <input suppressHydrationWarning type="checkbox" checked={form.createDetails} onChange={e=>setForm({...form, createDetails: e.target.checked})} />
                  <span className={`${styles.slider} ${form.createDetails ? styles.on : ''}`} />
                  <span className={styles.switchLabel}>{form.createDetails ? 'Will create' : 'No details page'}</span>
                </label>
              </div>

              {form.createDetails && (
                <label>
                  <div className="field-label">Details HTML</div>
                  <div style={{marginBottom:8}} className={styles.smallMuted}>Use the toolbar to format the details; content is stored as HTML.</div>
                  <div style={{border:'1px solid rgba(255,255,255,0.06)', borderRadius:8, padding:8, background: 'var(--card-bg)'}}>
                    <div style={{display:'flex', gap:8, marginBottom:8}}>
                      <button type="button" className={styles.btnGhost} onClick={() => { if (!detailsRef.current) return; detailsRef.current.focus(); document.execCommand('bold'); setTimeout(()=>setForm(f=>({...f, details: detailsRef.current?.innerHTML || ''})), 0); }} title="Bold">B</button>
                      <button type="button" className={styles.btnGhost} onClick={() => { if (!detailsRef.current) return; detailsRef.current.focus(); document.execCommand('italic'); setTimeout(()=>setForm(f=>({...f, details: detailsRef.current?.innerHTML || ''})), 0); }} title="Italic">I</button>
                      <button type="button" className={styles.btnGhost} onClick={() => { if (!detailsRef.current) return; detailsRef.current.focus(); document.execCommand('insertUnorderedList'); setTimeout(()=>setForm(f=>({...f, details: detailsRef.current?.innerHTML || ''})), 0); }} title="Bullet list">• List</button>
                      <button type="button" className={styles.btnGhost} onClick={() => { if (!detailsRef.current) return; detailsRef.current.focus(); document.execCommand('insertOrderedList'); setTimeout(()=>setForm(f=>({...f, details: detailsRef.current?.innerHTML || ''})), 0); }} title="Numbered list">1. List</button>
                      <button type="button" className={styles.btnGhost} onClick={() => { if (!detailsRef.current) return; const url = prompt('Insert link URL'); if (url) { detailsRef.current.focus(); document.execCommand('createLink', false, url); setTimeout(()=>setForm(f=>({...f, details: detailsRef.current?.innerHTML || ''})), 0); } }} title="Insert link">🔗</button>
                      <button type="button" className={styles.btnGhost} onClick={() => { if (!detailsRef.current) return; detailsRef.current.focus(); document.execCommand('undo'); setTimeout(()=>setForm(f=>({...f, details: detailsRef.current?.innerHTML || ''})), 0); }} title="Undo">↶</button>
                      <button type="button" className={styles.btnGhost} onClick={() => { if (!detailsRef.current) return; detailsRef.current.focus(); document.execCommand('redo'); setTimeout(()=>setForm(f=>({...f, details: detailsRef.current?.innerHTML || ''})), 0); }} title="Redo">↷</button>
                      <button type="button" className={styles.btnGhost} onClick={() => setDetailsExpanded(v=>!v)}>⤢</button>
                    </div>
                    <div id="admin-details-editor" ref={detailsRef} contentEditable suppressContentEditableWarning className={styles.formTextarea} onInput={(e: React.FormEvent<HTMLDivElement>)=>{ const v = (e.currentTarget as HTMLDivElement).innerHTML || ''; setForm(f=>({...f, details: v})); }} style={{minHeight: detailsExpanded ? 600 : 400, maxHeight:1200, overflow:'auto', resize:'vertical'}} />
                    <div style={{display:'flex', justifyContent:'space-between', marginTop:8}}>
                      <div className={styles.smallMuted}>{(form.details || '').replace(/<[^>]+>/g,'').length} chars</div>
                      <div className={styles.smallMuted}>{((form.details || '').replace(/<[^>]+>/g,'').trim().split(/\s+/).filter(Boolean)).length} words</div>
                    </div>
                  </div>
                  <div style={{marginTop:8}}>
                    <div className="field-label">Details images (max 6, 50MB each)</div>
                    <label className={styles.btnGhost + ' ' + styles.btnGhostSmall} style={{display:'inline-flex', alignItems:'center', gap:8}}>
                      <input type="file" accept="image/*" multiple onChange={e=>uploadDetailFiles(e.target.files)} style={{display:'none'}} />
                      
                      Upload details images
                    </label>
                    {uploadProgress > 0 && (
                      <div className="progress-bar" style={{marginTop:8}}>
                        <div className="progress-bar-inner" style={{width: `${uploadProgress}%`}} />
                      </div>
                    )}
                    <div style={{display:'flex', gap:8, marginTop:8, flexWrap:'wrap'}}>
                      {detailImages.map((src, idx)=> (
                        <div key={idx} style={{position:'relative'}}>
                            <img src={src} style={{width:96, height:72, objectFit:'cover', borderRadius:6}} />
                              <button type="button" className={styles.btnGhost + ' ' + styles.btnGhostSmall} style={{position:'absolute', right:4, top:4}} onClick={()=>{ setDetailImages(prev=> prev.filter((_,i)=>i!==idx)) }}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </label>
              )}
                <div className="flex gap-2">
                    <button suppressHydrationWarning className={styles.btnGhost} type="submit">Create</button>
                    <button type="button" className={styles.btnGhost} onClick={()=>setPreviewOpen(true)}>Preview</button>
                    <button type="button" className={styles.btnDanger} onClick={()=>{
                      try { localStorage.removeItem(`admin_project_draft:${form.slug || draftIdRef.current}`) } catch(e){}
                      setForm({ slug: '', title: '', subtitle: '', image_path: '', description: '', external_link: '', is_published: true, sort_order: 0, createDetails: false, details: '' })
                      setDetailImages([])
                      try { toast?.showToast && toast.showToast('Draft discarded', 'info') } catch(e){}
                    }}>Discard draft</button>
                </div>
                </form>
              </div>

              <aside>
                <div className={styles.panel} style={{padding:12}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div>
                      <div className={styles.fieldLabel}>Projects</div>
                      <div className="muted">Total: {items.length}</div>
                    </div>
                    <div>
                      <button className={styles.btnGhost} type="button" onClick={load}>Refresh</button>
                    </div>
                  </div>
                  <div style={{marginTop:12}}>
                    <input placeholder="Search by title or slug" className={styles.formInput} value={query} onChange={e=>{ setQuery(e.target.value) }} />
                      <div className={styles.smallMuted} style={{marginTop:8}}>Tip: click Edit to open project editor</div>
                      {uploadProgress < 0 ? (
                        <span style={{display:'block', marginTop:8, color:'#9fb7d6'}}>Uploading…</span>
                      ) : uploadProgress > 0 ? (
                        <div style={{display:'block', marginTop:8}}>
                          <div className="progress-bar" style={{width:120}}>
                            <div className="progress-bar-inner" style={{width: `${uploadProgress}%`}} />
                          </div>
                        </div>
                      ) : null}
                    </div>
                </div>
              </aside>

              <div style={{gridColumn:'1/-1'}}>
                <hr />
                <ProjectsList items={filtered} loading={loading} />
              </div>
              {previewOpen && (
                <div className={styles.modalOverlay} onClick={()=>setPreviewOpen(false)}>
                  <div className={styles.modalContent} onClick={(e)=>e.stopPropagation()} role="dialog" aria-modal="true">
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
                      <div style={{fontWeight:700}}>Preview</div>
                      <button className={styles.btnGhost} onClick={()=>setPreviewOpen(false)}>Close</button>
                    </div>
                    <div style={{maxWidth:520}}>
                      <Card title={form.title || 'Untitled'} subtitle={form.subtitle || ''}>
                        <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
                          <div style={{width:140, height:100, background:'#061426', borderRadius:8, overflow:'hidden', flex:'0 0 140px'}}>
                            {form.image_path ? <img src={form.image_path} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (detailImages[0] ? <img src={detailImages[0]} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:'#9fb7d6'}}>No image</div>)}
                          </div>
                          <div style={{flex:1}}>
                            <div style={{color:'var(--white-95)', marginBottom:8}} dangerouslySetInnerHTML={{ __html: purify ? purify.sanitize(String(form.description || '')) : (form.description || '') }} />
                            {(() => {
                              const generated = form.createDetails && form.slug ? `/projects/${form.slug}` : null
                              const linkUrl = form.external_link || generated
                              return linkUrl ? (
                                <div style={{marginTop:8}} className={styles.smallMuted}>Link: <a href={linkUrl} target="_blank" rel="noopener noreferrer">Click here to read more</a></div>
                              ) : null
                            })()}
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
        </div>
      </main>
  )
}
