"use client"

import React, { use, useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import styles from '../../admin.module.css'
import projectStyles from '../../../projects/hotspot/hotspot.module.css'
import Card from '../../../../components/card/card'
import { useToast } from '../../../../components/toast/ToastProvider'
import ProjectEditorSidebar from '../../../../components/admin/projects/ProjectEditorSidebar'

export default function ProjectEditor({ params }: { params: any }) {
  const paramsObj = use(params)
  const id = paramsObj?.id
  const router = useRouter()
  const [form, setForm] = useState({ id: 0, slug: '', title: '', subtitle: '', image_path: '', description: '', external_link: '', is_published: true, sort_order: 0, details: '' })
  const [images, setImages] = useState<string[]>([])
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [editorExpanded, setEditorExpanded] = useState(false)
  const descRef = useRef<HTMLDivElement | null>(null)
  const [descExpanded, setDescExpanded] = useState(false)
  const toast = useToast()
  const [previewOpen, setPreviewOpen] = useState(false)
  const autosaveTimerRef = useRef<number | null>(null)
  const initialLoadRef = useRef(true)
  const draftIdRef = useRef<string | null>(null)
  const fetchedProjectRef = useRef<any>(null)
  const [showDebug, setShowDebug] = useState(false)
  const didFetchPublicRef = useRef(false)

  // keep details editor content in sync only when editor is not focused
  useEffect(()=>{
    try {
      if (editorRef.current && document.activeElement !== editorRef.current) {
        if ((editorRef.current.innerHTML || '') !== (form.details || '')) {
          editorRef.current.innerHTML = form.details || ''
        }
      }
    } catch (e) {}
  }, [form.details])

  // keep description editor content in sync only when not focused
  useEffect(()=>{
    try {
      if (descRef.current && document.activeElement !== descRef.current) { 
        if ((descRef.current.innerHTML || '') !== (form.description || '')) {
          descRef.current.innerHTML = form.description || ''
        }
      }
    } catch (e) {}
  }, [form.description])

  // Ensure editors are populated after loading completes (refs available)
  useEffect(() => {
    if (loading) return
    try {
      if (editorRef.current && document.activeElement !== editorRef.current) {
        if ((editorRef.current.innerHTML || '') !== (form.details || '')) editorRef.current.innerHTML = form.details || ''
      }
    } catch (e) {}
    try {
      if (descRef.current && document.activeElement !== descRef.current) {
        if ((descRef.current.innerHTML || '') !== (form.description || '')) descRef.current.innerHTML = form.description || ''
      }
    } catch (e) {}
  }, [loading])

  useEffect(()=>{
    (async ()=>{
      try { console.log('[admin] loading project editor id=', id) } catch(e){}
      const res = await fetch('/api/admin/projects?page=1&limit=1000')
      const data = await res.json()
      const found = (data.items || []).find((p: any)=> String(p.id) === String(id))
      try { console.log('[admin] list query returned', Array.isArray(data.items) ? data.items.length : data) } catch(e){}
      let projectFound = found
      // If not found in listing (pagination or permissions), try fetching the single record
      if (!projectFound) {
        try { console.log('[admin] not in list; trying single fetch for id=', id) } catch(e){}
        try {
          const sres = await fetch(`/api/admin/projects?id=${encodeURIComponent(String(id))}`)
          if (sres.ok) {
            const sdata = await sres.json()
            try { console.log('[admin] single fetch returned', sdata) } catch(e){}
            if (sdata && Array.isArray(sdata.items) && sdata.items[0]) projectFound = sdata.items[0]
            else if (sdata && sdata.item) projectFound = sdata.item
            else if (sdata && sdata.id) projectFound = sdata
          } else {
            try { console.log('[admin] single fetch not ok', sres.status) } catch(e){}
          }
        } catch (e) {
          // ignore
        }
      }

      if (projectFound) {
      let md: any = null
      try { md = projectFound.metadata ? JSON.parse(projectFound.metadata) : null } catch (e) { md = null }
      const initDetails = (md && md.details) || ''
      const initDesc = projectFound.description || ''
      // if details are empty but description exists, initialize details from description
      const fallbackDetails = initDetails && String(initDetails).trim() ? initDetails : (initDesc && String(initDesc).trim() ? initDesc : '')
      try { console.log('[admin] initializing form from projectFound id=', projectFound.id, 'slug=', projectFound.slug, 'detailsLen=', String(fallbackDetails || '').length) } catch(e){}
      setForm({ id: projectFound.id, slug: projectFound.slug, title: projectFound.title, subtitle: projectFound.subtitle || '', image_path: projectFound.image_path || '', description: initDesc, external_link: projectFound.external_link || '', is_published: !!projectFound.is_published, sort_order: projectFound.sort_order || 0, details: fallbackDetails })
        // store raw fetched project for debug panel
        fetchedProjectRef.current = projectFound
        // populate editor refs once mounted — use RAF to avoid timing races
        try { requestAnimationFrame(()=>{ try { if (editorRef.current) { editorRef.current.innerHTML = fallbackDetails; console.log('[admin] populated editorRef, len=', (editorRef.current.innerHTML||'').length) } } catch(e){} }) } catch (e) {}
        try { requestAnimationFrame(()=>{ try { if (descRef.current) { descRef.current.innerHTML = initDesc; console.log('[admin] populated descRef, len=', (descRef.current.innerHTML||'').length) } } catch(e){} }) } catch (e) {}
        // start with metadata images (no hard slice here; display can show all)
        setImages((md && Array.isArray(md.images) ? md.images.slice(0,6) : []))
        // fetch any stored objects for this slug and merge them so admin sees all linked images
        ;(async () => {
          try {
            const mres = await fetch(`/api/admin/projects/migrate?slug=${encodeURIComponent(found.slug)}`)
            if (mres.ok) {
              const mdata = await mres.json()
              const urls: string[] = Array.isArray(mdata.urls) ? mdata.urls : []
              if (urls.length) {
                setImages(prev => {
                  const combined = [...prev]
                  for (const u of urls) {
                    // don't include the main image_path here (avoid duplication)
                    if (u && u !== found.image_path && !combined.includes(u)) combined.push(u)
                  }
                  return combined
                })
              }
            }
          } catch (e) {
            // ignore listing errors; admin can still use metadata images
          }
        })()
      }
      setLoading(false)
      // mark initial load complete so autosave doesn't immediately send
      initialLoadRef.current = false
    })()
  }, [id])

  // Debounced local draft autosave (stores to localStorage only)
  const draftKey = (idOrSlug?: string) => `admin_project_draft:${idOrSlug || form.slug || `project-${form.id}`}`

  // restore draft if present after initial load
  useEffect(()=>{
    if (initialLoadRef.current) return
    try {
      // prefer slug-based key when available
      const key = draftKey(form.slug || `project-${form.id}`)
      const raw = window.localStorage.getItem(key)
      if (raw) {
        try {
          const obj = JSON.parse(raw)
          if (obj && typeof obj === 'object') {
            // merge draft into current form but don't overwrite non-empty server values unless draft has them
            setForm(f => ({ ...f, ...((obj.form && typeof obj.form === 'object') ? obj.form : {}) }))
            setImages(prev=> Array.isArray(obj.images) ? obj.images : prev)
            try { toast.showToast && toast.showToast('Restored local draft', 'info') } catch(e){}
          }
        } catch (e) {}
      }
      draftIdRef.current = key
    } catch (e) {}
  }, [loading])

  // If details are empty after load, try fetching the public project page and extract `.story` HTML
  useEffect(()=>{
    if (initialLoadRef.current) return
    if (didFetchPublicRef.current) return
    if (!form.slug) return
    if (form.details && String(form.details).trim()) return
    // fetch the public page and extract .story
    (async ()=>{
      try {
        const res = await fetch(`/projects/${encodeURIComponent(form.slug)}`)
        if (!res.ok) return
        const txt = await res.text()
        const parser = new DOMParser()
        const doc = parser.parseFromString(txt, 'text/html')
        const story = doc.querySelector('.story') || doc.querySelector('[class*=\"story\"]')
        if (!story) return
        // attempt to remove the description block (first child) if it matches current description
        let detailsHtml = ''
        try {
          const children = Array.from(story.children || [])
          if (children.length > 1 && form.description && String(form.description).trim()) {
            const firstHtml = children[0].innerHTML || ''
            const descText = String(form.description).replace(/<[^>]+>/g, '').slice(0,200).trim()
            const firstText = firstHtml.replace(/<[^>]+>/g, '').slice(0,200).trim()
            if (firstText && descText && firstText.indexOf(descText) !== -1) {
              detailsHtml = children.slice(1).map(c=>c.outerHTML).join('')
            } else {
              detailsHtml = story.innerHTML
            }
          } else {
            detailsHtml = story.innerHTML
          }
        } catch (e) { detailsHtml = story.innerHTML }
        if (detailsHtml && detailsHtml.trim()) {
          // populate editor and form (local only)
          setForm(f=>({ ...f, details: detailsHtml }))
          try { requestAnimationFrame(()=>{ if (editorRef.current && document.activeElement !== editorRef.current) editorRef.current.innerHTML = detailsHtml }) } catch(e){}
          // save draft immediately
          try {
            const key = draftKey()
            window.localStorage.setItem(key, JSON.stringify({ form: { ...form, details: detailsHtml }, images }))
            try { toast.showToast && toast.showToast('Populated details from public page (local only)', 'info') } catch(e){}
          } catch (e) {}
        }
      } catch (e) {}
      didFetchPublicRef.current = true
    })()
  }, [form.slug, form.details, form.description, loading])

  useEffect(()=>{
    if (initialLoadRef.current) return
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = window.setTimeout(()=>{
      try {
        const key = draftKey()
        const payload = { form, images, savedAt: Date.now() }
        window.localStorage.setItem(key, JSON.stringify(payload))
        try { toast.showToast && toast.showToast('Draft saved locally', 'success') } catch(e){}
      } catch (e) {
        try { toast.showToast && toast.showToast('Could not save draft locally', 'error') } catch(e){}
      }
    }, 800)
    return () => { if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current) }
  // only watch editable fields
  }, [form.title, form.subtitle, form.slug, form.description, form.details, images])

  async function save(e?: React.FormEvent | any) {
    if (e?.preventDefault) e.preventDefault()
    const metadata: any = { ...(form.details ? { details: form.details } : {}), images: images }
    await fetch('/api/admin/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, metadata }) })
    try { toast.showToast && toast.showToast('Project saved', 'success') } catch (e) {}
    router.push('/admin/projects')
  }

  // removed local-only removeImage in favor of deleteImage which persists changes

  async function deleteImage(idx: number) {
    const src = images[idx]
    if (!src) return
    if (!confirm('Delete this image from the project and storage?')) return
    try {
      const res = await fetch('/api/uploads/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: src }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Delete failed')
      // remove locally and persist metadata change
      const copy = images.slice()
      copy.splice(idx,1)

      // if the deleted image was the main image_path, clear it
      const newForm = { ...form }
      if (newForm.image_path === src) newForm.image_path = ''

      // build metadata
      const metadata: any = { ...(newForm.details ? { details: newForm.details } : {}), images: copy }

      // persist changes to project
      try {
        await fetch('/api/admin/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newForm, metadata }) })
      } catch (e) {
        // ignore persistence errors for now
      }

      setImages(copy)
      setForm(newForm)
    } catch (e:any) {
      alert('Could not delete image: ' + String(e?.message || e))
    }
  }

  async function editMainImage() {
    const val = prompt('Edit main image URL', form.image_path || '')
    if (val === null) return
    const newForm = { ...form, image_path: val }
    setForm(newForm)
    try {
      await fetch('/api/admin/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: form.id, image_path: val }) })
    } catch (e) { /* ignore save error */ }
  }

  async function uploadMainImage(file: File | null) {
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('slug', form.slug || `project-${form.id}`)
    fd.append('filename', file.name)
    try {
      const res = await fetch('/api/uploads/direct', { method: 'POST', body: fd })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Upload failed')
      const url = j.publicUrl || j.key
      const newForm = { ...form, image_path: url }
      setForm(newForm)
      try { await fetch('/api/admin/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: form.id, image_path: url }) }) } catch (e) { /* ignore */ }
      try { toast.showToast && toast.showToast('Main image uploaded', 'success') } catch(e){}
    } catch (e:any) { alert('Upload failed: ' + (e?.message || e)); try { toast.showToast && toast.showToast('Upload failed', 'error') } catch(e){} }
  }

  async function deleteMainImage() {
    if (!form.image_path) return
    if (!confirm('Delete the main image from storage and clear Image path?')) return
    try {
      await fetch('/api/uploads/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: form.image_path }) })
    } catch (e) { /* ignore */ }
    const newForm = { ...form, image_path: '' }
    setForm(newForm)
    try { await fetch('/api/admin/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: form.id, image_path: '' }) }) } catch (e) { /* ignore */ }
  }

  function moveImage(idx: number, dir: number) {
    const copy = images.slice()
    const to = idx + dir
    if (to < 0 || to >= copy.length) return
    const tmp = copy[to]
    copy[to] = copy[idx]
    copy[idx] = tmp
    setImages(copy)
    // persist new ordering
    try {
      const metadata: any = { ...(form.details ? { details: form.details } : {}), images: copy }
      fetch('/api/admin/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: form.id, metadata }) })
    } catch (e) { /* ignore */ }
  }

  function editImage(idx: number) {
    const cur = images[idx]
    const val = prompt('Edit image URL', cur)
    if (val === null) return
    const copy = images.slice()
    copy[idx] = val
    setImages(copy)
    // persist edited URL
    try {
      const metadata: any = { ...(form.details ? { details: form.details } : {}), images: copy }
      fetch('/api/admin/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: form.id, metadata }) })
    } catch (e) { /* ignore */ }
  }

  function uploadFiles(files: FileList | null) {
    if (!files) return
    const maxAdd = Math.max(0, 6 - images.length)
    const toAdd = Array.from(files).slice(0, maxAdd)
    const MAX_BYTES = 50 * 1024 * 1024 // 50MB
    const uploadOne = (file: File) => new Promise<void>((resolve, reject) => {
      if (file.size > MAX_BYTES) return reject(new Error('File too large (max 50MB)'))
      const fd = new FormData()
      fd.append('file', file)
      fd.append('slug', form.slug || `project-${form.id}`)
      fd.append('filename', file.name)
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/uploads/direct')
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
        }
      }
      xhr.onload = async () => {
        try {
          const res = JSON.parse(xhr.responseText)
          if (xhr.status >= 200 && xhr.status < 300) {
            const url = res.publicUrl || res.key
            // append to images and persist metadata using the resulting array
            setImages(prev => {
              const next = [...prev.slice(0,5), url]
              setUploadProgress(0)
              ;(async ()=>{
                try {
                  const metadata = { ...(form.details ? { details: form.details } : {}), images: next }
                  await fetch('/api/admin/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: form.id, metadata }) })
                    try { toast.showToast && toast.showToast('Image uploaded', 'success') } catch(e){}
                } catch (e) { /* ignore autosave errors */ }
              })()
              return next
            })
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
        try { await uploadOne(f) } catch (e:any) { alert('Upload error: ' + String(e?.message || e)); break }
      }
    })()
  }

  async function remove() {
    if (!confirm('Delete this project?')) return
    await fetch(`/api/admin/projects?id=${form.id}`, { method: 'DELETE' })
    router.push('/admin/projects')
  }

  useEffect(()=>{
    const handler = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [form, images])

  return (
    <div>
      <div style={{marginBottom:12}} className={styles.topTitle}>Edit Project — ID: {id} <span style={{marginLeft:8}} className={styles.kbd}>Ctrl/Cmd+S</span></div>
      {showDebug ? (
        <div style={{background:'#071826', padding:12, borderRadius:8, marginBottom:12}}>
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
            <strong>Debug: fetched project</strong>
            <button className={styles.btnGhost} onClick={()=>setShowDebug(false)}>Hide</button>
          </div>
          <pre style={{whiteSpace:'pre-wrap', maxHeight:240, overflow:'auto', fontSize:12}}>{fetchedProjectRef.current ? JSON.stringify(fetchedProjectRef.current, null, 2) : 'no project loaded'}</pre>
        </div>
      ) : (
        <div style={{marginBottom:12}}>
          <button className={styles.btnGhost} onClick={()=>setShowDebug(true)}>Show debug</button>
        </div>
      )}
      {loading ? <p>Loading…</p> : (
        <form onSubmit={save} className={styles.editorGrid}>
          <div>
              <label>
                <div className="field-label">Slug</div>
                <input value={form.slug} onChange={e=>setForm({...form, slug: e.target.value})} className={styles.formInput} />
              </label>

              <label>
                <div className="field-label">Title</div>
                <input value={form.title} onChange={e=>setForm({...form, title: e.target.value})} className={styles.formInput} />
              </label>

              <label>
                <div className={styles.fieldLabel}>Details images (showing up to 4; 50MB each)</div>
                <label className={styles.btnGhost + ' ' + styles.btnGhostSmall} style={{display:'inline-flex', alignItems:'center', gap:8}}>
                  <input className={styles.fileInput} type="file" accept="image/*" multiple onChange={e=>uploadFiles(e.target.files)} style={{display:'none'}} />
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M8 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Upload images
                </label>
              </label>

              <label>
                <div className="field-label">Subtitle</div>
                <input value={form.subtitle} onChange={e=>setForm({...form, subtitle: e.target.value})} className={styles.formInput} />
              </label>
                <div>
                <div className="field-label">Details images (showing up to 4; 50MB each)</div>
                <label className={styles.btnGhost + ' ' + styles.btnGhostSmall} style={{display:'inline-flex', alignItems:'center', gap:8}}>
                  <input type="file" accept="image/*" multiple onChange={e=>uploadFiles(e.target.files)} style={{display:'none'}} />
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M8 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Upload images
                </label>
                {uploadProgress > 0 && (
                  <div className="progress-bar" style={{marginTop:8}}>
                    <div className="progress-bar-inner" style={{width:`${uploadProgress}%`}} />
                  </div>
                )}
                <div className={styles.imgGallery} style={{marginTop:8}}>
                  {images.slice(0,4).map((src, idx)=> (
                    <div key={idx} style={{position:'relative', width:96}}>
                      <img src={src} onClick={()=>setForm({...form, image_path: src})} className={styles.thumb} style={{boxShadow: src===form.image_path ? '0 0 0 3px #0b84ff66' : undefined, cursor:'pointer'}} />
                      <div className={styles.controls}>
                        <button type="button" className={styles.btnGhost} onClick={()=>moveImage(idx, -1)} disabled={idx===0} title="Move left">◀</button>
                        <button type="button" className={styles.btnGhost} onClick={()=>moveImage(idx, 1)} disabled={idx===Math.min(images.length,4)-1} title="Move right">▶</button>
                        <button type="button" className={styles.btnGhost} onClick={()=>editImage(idx)} title="Edit URL">✎</button>
                        <button type="button" className={styles.btnGhost} style={{marginLeft:'auto'}} onClick={()=>deleteImage(idx)}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <label>
                <div className={styles.fieldLabel}>Details (HTML allowed)</div>
                <div style={{marginBottom:8}} className={styles.smallMuted}>Use the toolbar to format text; content is stored as HTML.</div>
                <div style={{border:'1px solid rgba(255,255,255,0.06)', borderRadius:8, padding:8, background: 'var(--card-bg)'}}>
                  <div style={{display:'flex', gap:8, marginBottom:8}}>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!editorRef.current) return; editorRef.current.focus(); document.execCommand('bold'); setTimeout(()=>setForm(f=>({ ...f, details: editorRef.current?.innerHTML || '' })), 0); }} title="Bold">B</button>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!editorRef.current) return; editorRef.current.focus(); document.execCommand('italic'); setTimeout(()=>setForm(f=>({ ...f, details: editorRef.current?.innerHTML || '' })), 0); }} title="Italic">I</button>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!editorRef.current) return; editorRef.current.focus(); document.execCommand('insertUnorderedList'); setTimeout(()=>setForm(f=>({ ...f, details: editorRef.current?.innerHTML || '' })), 0); }} title="Bullet list">• List</button>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!editorRef.current) return; editorRef.current.focus(); document.execCommand('insertOrderedList'); setTimeout(()=>setForm(f=>({ ...f, details: editorRef.current?.innerHTML || '' })), 0); }} title="Numbered list">1. List</button>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!editorRef.current) return; const url = prompt('Insert link URL'); if (url) { editorRef.current.focus(); document.execCommand('createLink', false, url); setTimeout(()=>setForm(f=>({ ...f, details: editorRef.current?.innerHTML || '' })), 0); } }} title="Insert link">🔗</button>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!editorRef.current) return; editorRef.current.focus(); document.execCommand('undo'); setTimeout(()=>setForm(f=>({ ...f, details: editorRef.current?.innerHTML || '' })), 0); }} title="Undo">↶</button>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!editorRef.current) return; editorRef.current.focus(); document.execCommand('redo'); setTimeout(()=>setForm(f=>({ ...f, details: editorRef.current?.innerHTML || '' })), 0); }} title="Redo">↷</button>
                    <button type="button" className={styles.btnGhost} onClick={() => setEditorExpanded(v => !v)} title="Expand editor">⤢</button>
                  </div>
                  <div
                    id="project-details-editor"
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e:any)=>{ try { const v = e?.currentTarget?.innerHTML || ''; setForm(f=>({ ...f, details: v })); } catch (err) { /* ignore transient events */ } }}
                    onFocus={() => { try { if (editorRef.current && !(editorRef.current.innerHTML || '').trim() && (form.details || '').trim()) { editorRef.current.innerHTML = form.details || '' } } catch (e) {} }}
                    className={styles.formTextarea}
                    style={{minHeight: editorExpanded ? 600 : 400, maxHeight:1200, overflow:'auto', resize:'vertical'}}
                  />
                </div>
              </label>
            </div>

          <ProjectEditorSidebar
            form={form}
            setForm={setForm}
            images={images}
            uploadMainImage={uploadMainImage}
            editMainImage={editMainImage}
            deleteMainImage={deleteMainImage}
            uploadFiles={uploadFiles}
            uploadProgress={uploadProgress}
            moveImage={moveImage}
            editImage={editImage}
            deleteImage={deleteImage}
            onRemove={remove}
          />
              <label>
                <div className={styles.fieldLabel}>Image path</div>
                <input value={form.image_path} onChange={e=>setForm({...form, image_path: e.target.value})} className={styles.formInput} />
                <div style={{marginTop:8}}>
                  <div className={styles.smallMuted} style={{marginBottom:6}}>Main image (shown on list/cards)</div>
                  <div style={{display:'flex', gap:12, alignItems:'center'}}>
                    <div style={{position:'relative'}}>
                      <img src={form.image_path || undefined} alt="Main" style={{width:320, height:200, objectFit:'cover', borderRadius:6, background:'#0b2430'}} />
                      <div style={{position:'absolute', right:8, top:8, display:'flex', gap:6}}>
                        <button type="button" className={styles.btnGhost} onClick={editMainImage} title="Edit main image URL">✎</button>
                        <button type="button" className={styles.btnGhost} onClick={deleteMainImage} title="Delete main image">🗑</button>
                        <label title="Upload new main image" className={styles.btnGhost + ' ' + styles.btnGhostSmall} style={{display:'inline-flex', alignItems:'center', gap:8}}>
                          <input type="file" accept="image/*" onChange={e=>uploadMainImage(e.target.files?.[0] || null)} style={{display:'none'}} />
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M8 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          Upload
                        </label>
                      </div>
                    </div>
                    <div className={styles.smallMuted}>Edit this to change the image used on product listings.</div>
                  </div>
                </div>
              </label>
              <label>
                <div className="field-label">Description (HTML allowed)</div>
                <div style={{marginBottom:8}} className={styles.smallMuted}>This is the main project description shown on the projects list and project page.</div>
                <div style={{border:'1px solid rgba(255,255,255,0.06)', borderRadius:8, padding:8, background: 'var(--card-bg)'}}>
                  <div style={{display:'flex', gap:8, marginBottom:8}}>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('bold'); setTimeout(()=>setForm(f=>({ ...f, description: descRef.current?.innerHTML || '' })), 0); }} title="Bold">B</button>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('italic'); setTimeout(()=>setForm(f=>({ ...f, description: descRef.current?.innerHTML || '' })), 0); }} title="Italic">I</button>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('insertUnorderedList'); setTimeout(()=>setForm(f=>({ ...f, description: descRef.current?.innerHTML || '' })), 0); }} title="Bullet list">• List</button>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('insertOrderedList'); setTimeout(()=>setForm(f=>({ ...f, description: descRef.current?.innerHTML || '' })), 0); }} title="Numbered list">1. List</button>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; const url = prompt('Insert link URL'); if (url) { descRef.current.focus(); document.execCommand('createLink', false, url); setTimeout(()=>setForm(f=>({ ...f, description: descRef.current?.innerHTML || '' })), 0); } }} title="Insert link">🔗</button>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('undo'); setTimeout(()=>setForm(f=>({ ...f, description: descRef.current?.innerHTML || '' })), 0); }} title="Undo">↶</button>
                    <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('redo'); setTimeout(()=>setForm(f=>({ ...f, description: descRef.current?.innerHTML || '' })), 0); }} title="Redo">↷</button>
                    <button type="button" className={styles.btnGhost} onClick={() => setDescExpanded(v => !v)} title="Expand editor">⤢</button>
                  </div>
                  <div
                    id="project-desc-editor"
                    ref={descRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e:any)=>{ try { const v = e?.currentTarget?.innerHTML || ''; setForm(f=>({ ...f, description: v })); } catch (err) { /* ignore transient events */ } }}
                    onFocus={() => { try { if (descRef.current && !(descRef.current.innerHTML || '').trim() && (form.description || '').trim()) { descRef.current.innerHTML = form.description || '' } } catch (e) {} }}
                    className={styles.formTextarea}
                    style={{minHeight: descExpanded ? 400 : 220, maxHeight:800, overflow:'auto', resize:'vertical'}}
                  />
                </div>
              </label>
              <label>
                <div className="field-label">External link</div>
                <input value={form.external_link} onChange={e=>setForm({...form, external_link: e.target.value})} className={styles.formInput} />
              </label>
              <div>
                <div className={styles.fieldLabel}>Published</div>
                <label className={styles.switch + ' ' + styles.switchSmall}>
                  <input type="checkbox" checked={form.is_published} onChange={e=>setForm({...form, is_published: e.target.checked})} />
                  <span className={`${styles.slider} ${form.is_published ? styles.on : ''}`} />
                  <span className={styles.switchLabel}>{form.is_published ? 'Published' : 'Draft'}</span>
                </label>
              </div>
          <div style={{gridColumn: '1/-1'}}>
            <div className={styles.stickyBar}>
              <div style={{marginRight:'auto'}} className={styles.smallMuted}>
                {saving ? (
                  'Saving…'
                ) : (
                  <>
                    Changes saved automatically on upload; press <span className={styles.kbd}>Ctrl/Cmd+S</span> to save now.
                  </>
                )}
              </div>
              <div>
                <button className={styles.btnGhost} type="submit">Save</button>
                <button className={styles.btnGhost} type="button" onClick={()=>setPreviewOpen(true)}>Preview</button>
                <button className={styles.btnGhost} type="button" onClick={()=>router.push('/admin/projects')}>Cancel</button>
                <button className={styles.btnDanger} type="button" onClick={remove}>Delete</button>
              </div>
            </div>
          </div>
        </form>
          )}
          {previewOpen && (
            <div className={styles.modalOverlay} onClick={()=>setPreviewOpen(false)}>
              <div className={styles.modalContent} onClick={(e)=>e.stopPropagation()} role="dialog" aria-modal="true">
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
                  <div style={{fontWeight:700}}>Preview</div>
                  <button className={styles.btnGhost} onClick={()=>setPreviewOpen(false)}>Close</button>
                </div>
                <div style={{maxWidth:920}}>
                  {form.slug ? (
                    <div style={{display:'flex',flexDirection:'column',gap:12}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div style={{fontWeight:600}}>{`/projects/${form.slug}`}</div>
                        <div>
                          <a className={styles.btnGhost} href={`/projects/${form.slug}`} target="_blank" rel="noopener noreferrer">Open in new tab</a>
                        </div>
                      </div>
                      {/* Compact card preview styled with public project CSS to match front-end */}
                      <div>
                        <Card title={form.title || 'Untitled'} subtitle={form.subtitle || ''}>
                          <div className={projectStyles.content} style={{gap:8}}>
                            <div className={projectStyles.media}>
                              {form.image_path ? (
                                <div className={projectStyles.mainPhotoWrap} style={{maxWidth:320}}>
                                  <img src={form.image_path} alt={form.title} className={projectStyles.mainPhoto} />
                                </div>
                              ) : null}
                            </div>
                            <div className={projectStyles.story}>
                              <div style={{color:'var(--white-95)'}} dangerouslySetInnerHTML={{ __html: form.description || '' }} />
                              {form.details ? <div style={{marginTop:8}} dangerouslySetInnerHTML={{ __html: String(form.details).slice(0,400) + (String(form.details).length > 400 ? '…' : '') }} /> : null}
                            </div>
                          </div>
                        </Card>
                      </div>
                      <div style={{border:'1px solid rgba(255,255,255,0.04)', borderRadius:8, overflow:'hidden'}}>
                        <iframe src={`/projects/${form.slug}`} title={`Preview ${form.slug}`} style={{width:'100%', height:720, border:0}} />
                      </div>
                    </div>
                  ) : (
                    <Card title={form.title || 'Untitled'} subtitle={form.subtitle || ''}>
                      <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
                        <div style={{width:140, height:100, background:'#061426', borderRadius:8, overflow:'hidden', flex:'0 0 140px'}}>
                          {form.image_path ? <img src={form.image_path} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:'#9fb7d6'}}>No image</div>}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{color:'var(--white-95)', marginBottom:8}} dangerouslySetInnerHTML={{ __html: form.description || '' }} />
                          {(() => {
                            const generated = (form.details || '').trim() ? `/projects/${form.slug}` : null
                            const linkUrl = form.external_link || generated
                            return linkUrl ? (
                              <div style={{marginTop:8}} className={styles.smallMuted}><a href={linkUrl} target="_blank" rel="noopener noreferrer">Click here to read more</a></div>
                            ) : null
                          })()}
                        </div>
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          )}
    </div>
  )
}
