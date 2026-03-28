"use client"

import React, { useEffect, useEffectEvent, useState, useRef } from 'react'
import Image from 'next/image'
import { useRouter, useParams } from 'next/navigation'
import { buildPublicUrl } from '@/lib/s3'
import styles from '../../admin.module.css'
import projectStyles from '../../../projects/hotspot/hotspot.module.css'
import Card from '../../../../components/card/card'
import RichTextEditor from '../../../../components/admin/RichTextEditor'
import { useToast } from '../../../../components/toast/ToastProvider'
import ProjectEditorSidebar from '../../../../components/admin/projects/ProjectEditorSidebar'
import createDOMPurify from 'dompurify'

type ProjectForm = {
  id?: number
  slug?: string
  title?: string
  subtitle?: string
  image_path?: string
  description?: string
  external_link?: string
  is_published?: boolean
  sort_order?: number
  details?: string
}

export default function ProjectEditor() {
  const routeParams = useParams()
  const id = routeParams?.id
  const router = useRouter()
  const [form, setForm] = useState<ProjectForm>({ id: 0, slug: '', title: '', subtitle: '', image_path: '', description: '', external_link: '', is_published: true, sort_order: 0, details: '' })
  const [images, setImages] = useState<string[]>([])
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const purify = typeof window !== 'undefined' ? createDOMPurify(window as unknown as Window & typeof globalThis) : null
  if (purify && typeof purify.setConfig === 'function') purify.setConfig({ FORBID_TAGS: ['script', 'style'] })
  const frec = form as Record<string, unknown>
  const safeDescription = (frec.description_sanitized as string) ?? (purify ? purify.sanitize(String(form.description || '')) : (form.description || ''))
  const safeDetails = (frec.details_sanitized as string) ?? (purify ? purify.sanitize(String(form.details || '')) : (form.details || ''))
  const [previewOpen, setPreviewOpen] = useState(false)
  const toPublicUrl = (p?: string) => {
    if (!p) return undefined
    const s = String(p)
    if (s.indexOf('X-Amz-Algorithm') !== -1 || s.indexOf('minio') !== -1 || s.indexOf('127.0.0.1') !== -1) {
      try {
        const u = new URL(s)
        let path = u.pathname.replace(/^\//, '')
        const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
        if (bucket && path.startsWith(bucket + '/')) path = path.slice(bucket.length + 1)
        return buildPublicUrl(path)
      } catch {
        return buildPublicUrl(s)
      }
    }
    if (s.startsWith('http') || s.startsWith('data:')) return s
    if (s.startsWith('/')) return s
    return buildPublicUrl(s)
  }
  const autosaveTimerRef = useRef<number | null>(null)
  const initialLoadRef = useRef(true)
  const draftIdRef = useRef<string | null>(null)
  const fetchedProjectRef = useRef<Record<string, unknown> | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'project' | 'image' | 'main'; idx?: number } | null>(null)
  const didFetchPublicRef = useRef(false)

  useEffect(()=>{
    (async ()=>{
      try { console.log('[admin] loading project editor id=', id) } catch{}
      const res = await fetch('/admin/api/projects?page=1&limit=1000')
      const data = await res.json()
      const itemsArray = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : []
      const found = itemsArray.find(p => String((p as Record<string, unknown>).id) === String(id))
      try { console.log('[admin] list query returned', Array.isArray(data.items) ? data.items.length : data) } catch{}
      let projectFound = found
      // If not found in listing (pagination or permissions), try fetching the single record
      if (!projectFound) {
        try { console.log('[admin] not in list; trying single fetch for id=', id) } catch{}
        try {
          const sres = await fetch(`/admin/api/projects?id=${encodeURIComponent(String(id))}`)
          if (sres.ok) {
            const sdata = await sres.json()
            try { console.log('[admin] single fetch returned', sdata) } catch{}
            if (sdata && Array.isArray(sdata.items) && sdata.items[0]) projectFound = sdata.items[0]
            else if (sdata && sdata.item) projectFound = sdata.item
            else if (sdata && sdata.id) projectFound = sdata
            } else {
            try { console.log('[admin] single fetch not ok', sres.status) } catch{}
          }
        } catch {
          // ignore
        }
      }

      if (projectFound) {
      let md: unknown = null
      try { md = projectFound && (projectFound as Record<string, unknown>).metadata ? JSON.parse(String((projectFound as Record<string, unknown>).metadata)) : null } catch { md = null }
      let initDetails = ''
      if (md && typeof md === 'object' && 'details' in (md as Record<string, unknown>)) {
        const d = (md as Record<string, unknown>).details
        initDetails = d ? String(d) : ''
      }
      const initDesc = String((projectFound as Record<string, unknown>).description || '')
      // if details are empty but description exists, initialize details from description
      const fallbackDetails = initDetails && String(initDetails).trim() ? initDetails : (initDesc && String(initDesc).trim() ? initDesc : '')
      try { console.log('[admin] initializing form from projectFound id=', projectFound.id, 'slug=', projectFound.slug, 'detailsLen=', String(fallbackDetails || '').length) } catch{}
      setForm({
        id: Number((projectFound as Record<string, unknown>).id) || 0,
        slug: String((projectFound as Record<string, unknown>).slug || ''),
        title: String((projectFound as Record<string, unknown>).title || ''),
        subtitle: String((projectFound as Record<string, unknown>).subtitle || ''),
        image_path: String((projectFound as Record<string, unknown>).image_path || ''),
        description: initDesc,
        external_link: String((projectFound as Record<string, unknown>).external_link || ''),
        is_published: !!((projectFound as Record<string, unknown>).is_published),
        sort_order: Number((projectFound as Record<string, unknown>).sort_order) || 0,
        details: fallbackDetails,
      })
        // store raw fetched project for debug panel
        fetchedProjectRef.current = projectFound
        // start with metadata images (no hard slice here; display can show all)
        setImages((md && typeof md === 'object' && Array.isArray((md as Record<string, unknown>).images)) ? (((md as Record<string, unknown>).images as unknown) as string[]).slice(0,6) : [])
        // fetch any stored objects for this slug and merge them so admin sees all linked images
        ;(async () => {
          try {
            const mres = await fetch(`/admin/api/projects/migrate?slug=${encodeURIComponent((projectFound as Record<string, unknown>).slug as string)}`)
            if (mres.ok) {
              const mdata = await mres.json()
              const urls: string[] = Array.isArray(mdata.urls) ? mdata.urls : []
              if (urls.length) {
                setImages(prev => {
                  const combined = [...prev]
                  for (const u of urls) {
                    // don't include the main image_path here (avoid duplication)
                      if (u && u !== (projectFound as Record<string, unknown>).image_path && !combined.includes(u)) combined.push(u)
                  }
                  return combined
                })
              }
            }
          } catch {
            // ignore listing errors; admin can still use metadata images
          }
        })()
      }
      setLoading(false)
      // mark initial load complete so autosave doesn't immediately send
      initialLoadRef.current = false
    })()
  }, [id])

  // restore draft if present after initial load
  useEffect(()=>{
    if (initialLoadRef.current) return
    try {
      // prefer slug-based key when available
      const key = `admin_project_draft:${form.slug || `project-${form.id}`}`
      const raw = window.localStorage.getItem(key)
      if (raw) {
        try {
          const obj = JSON.parse(raw)
          if (obj && typeof obj === 'object') {
            // merge draft into current form but don't overwrite non-empty server values unless draft has them
            setForm(f => ({ ...f, ...((obj.form && typeof obj.form === 'object') ? obj.form : {}) }))
            setImages(prev=> Array.isArray(obj.images) ? obj.images : prev)
          }
        } catch {}
      }
      draftIdRef.current = key
    } catch {}
  }, [form.id, form.slug, loading])

  // If details are empty after load, try fetching the public project page and extract `.story` HTML
  useEffect(()=>{
    if (initialLoadRef.current) return
    if (didFetchPublicRef.current) return
    if (!form.slug) return
    if (form.details && String(form.details).trim()) return
    // fetch the public page and extract .story
    (async ()=>{
      try {
        const res = await fetch(`/projects/${encodeURIComponent(String(form.slug))}`)
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
        } catch { detailsHtml = story.innerHTML }
        if (detailsHtml && detailsHtml.trim()) {
          setForm(f=>({ ...f, details: detailsHtml }))
        }
      } catch {}
      didFetchPublicRef.current = true
    })()
  }, [form.slug, form.details, form.description, loading])

  useEffect(()=>{
    if (initialLoadRef.current) return
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = window.setTimeout(()=>{
      try {
        const key = `admin_project_draft:${form.slug || `project-${form.id}`}`
        const payload = { form, images, savedAt: Date.now() }
        window.localStorage.setItem(key, JSON.stringify(payload))
      } catch {
        // ignore draft write failures
      }
    }, 800)
    return () => { if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current) }
  }, [form, images])

  async function save(e?: React.FormEvent) {
    if (e) e.preventDefault()
    setSaving(true)
    const metadata = { ...(form.details ? { details: form.details } : {}), images }
    try {
      await fetch('/admin/api/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, metadata }) })
      toast.showToast?.('Project saved', 'success')
      router.push('/admin/projects')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveShortcut = useEffectEvent(() => {
    void save()
  })

  // removed local-only removeImage in favor of deleteImage which persists changes

  async function deleteImage(idx: number) {
    // prompt via modal
    setConfirmDelete({ type: 'image', idx })
  }

  async function editMainImage() {
    const val = prompt('Edit main image URL', form.image_path || '')
    if (val === null) return
    const newForm = { ...form, image_path: val }
    setForm(newForm)
    try {
      await fetch('/admin/api/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: form.id, image_path: val }) })
    } catch { /* ignore save error */ }
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
      try { await fetch('/admin/api/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: form.id, image_path: url }) }) } catch { /* ignore */ }
      toast.showToast?.('Main image uploaded', 'success')
    } catch (e: unknown) {
      let msg = 'Unknown error'
      if (e instanceof Error) msg = e.message
      else msg = String(e)
      alert('Upload failed: ' + msg)
      toast.showToast?.('Upload failed', 'error')
    }
  }

  async function deleteMainImage() {
    if (!form.image_path) return
    setConfirmDelete({ type: 'main' })
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
      const metadata = { ...(form.details ? { details: form.details } : {}), images: copy }
      fetch('/admin/api/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: form.id, metadata }) })
    } catch { /* ignore */ }
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
      const metadata = { ...(form.details ? { details: form.details } : {}), images: copy }
      fetch('/admin/api/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: form.id, metadata }) })
    } catch { /* ignore */ }
  }

  function uploadFiles(files: FileList | null | undefined) {
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
                  await fetch('/admin/api/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: form.id, metadata }) })
                  toast.showToast?.('Image uploaded', 'success')
                } catch { /* ignore autosave errors */ }
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
        try { await uploadOne(f) } catch (e: unknown) { let msg = 'Unknown error'; if (e instanceof Error) msg = e.message; else msg = String(e); alert('Upload error: ' + String(msg)); break }
      }
    })()
  }

  async function remove() {
    setConfirmDelete({ type: 'project' })
  }

  async function doConfirmDelete(choice: { type: 'project' | 'image' | 'main'; idx?: number } | null) {
    if (!choice) return
    try {
      if (choice.type === 'project') {
        await fetch(`/admin/api/projects?id=${form.id}`, { method: 'DELETE' })
        router.push('/admin/projects')
        return
      }
      if (choice.type === 'image' && typeof choice.idx === 'number') {
        const src = images[choice.idx]
        if (!src) return
        try {
          const res = await fetch('/api/uploads/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: src }) })
          const data = await res.json().catch(()=>({}))
          if (!res.ok) throw new Error(data?.error || 'Delete failed')
        } catch {
          // ignore delete errors but continue to remove locally
        }
        const copy = images.slice()
        copy.splice(choice.idx,1)
        const newForm = { ...form }
        if (newForm.image_path === src) newForm.image_path = ''
        const metadata = { ...(newForm.details ? { details: newForm.details } : {}), images: copy }
        try { await fetch('/admin/api/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: form.id, metadata }) }) } catch {}
        setImages(copy)
        setForm(newForm)
        return
      }
      if (choice.type === 'main') {
        try { await fetch('/api/uploads/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: form.image_path }) }) } catch {}
        const newForm = { ...form, image_path: '' }
        setForm(newForm)
        try { await fetch('/admin/api/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: form.id, image_path: '' }) }) } catch {}
        return
      }
    } catch (e) {
      console.error('confirm delete error', e)
    }
  }

  useEffect(()=>{
    const handler = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault()
        handleSaveShortcut()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div>
      {confirmDelete ? (
        <div className={styles.modalOverlay} onClick={()=>setConfirmDelete(null)}>
          <div className={styles.modalContent} onClick={(e)=>e.stopPropagation()} role="dialog" aria-modal="true">
            <div style={{fontWeight:700, marginBottom:8}}>Confirm delete</div>
            <div>
              {confirmDelete.type === 'project' ? 'Delete this project and its associated data?' : (confirmDelete.type === 'image' ? 'Delete this image from the project and storage?' : 'Delete the main image from storage and clear Image path?')}
            </div>
            <div style={{display:'flex', gap:8, marginTop:12}}>
              <button className={styles.btnGhost} onClick={()=>setConfirmDelete(null)}>Cancel</button>
              <button className={styles.btnDanger} onClick={async ()=>{ await doConfirmDelete(confirmDelete); setConfirmDelete(null); }}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}
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
                      <Image src={toPublicUrl(src) || ''} alt={`Project gallery image ${idx + 1}`} width={96} height={96} unoptimized onClick={()=>setForm({...form, image_path: src})} className={styles.thumb} style={{boxShadow: src===form.image_path ? '0 0 0 3px #0b84ff66' : undefined, cursor:'pointer'}} />
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
                <RichTextEditor
                  value={String(form.details || '')}
                  onChange={(value) => setForm(f => ({ ...f, details: value }))}
                  placeholder="Write the project details content…"
                  minHeight={420}
                  expandedMinHeight={640}
                />
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
                      <Image src={toPublicUrl(form.image_path) || ''} alt={form.title || 'Main project image'} width={320} height={200} unoptimized style={{width:320, height:200, objectFit:'cover', borderRadius:6, background:'#0b2430'}} />
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
                <RichTextEditor
                  value={String(form.description || '')}
                  onChange={(value) => setForm(f => ({ ...f, description: value }))}
                  placeholder="Write the project summary…"
                  minHeight={240}
                  expandedMinHeight={420}
                />
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
                                  <Image src={toPublicUrl(form.image_path) || ''} alt={form.title || 'Project preview image'} width={320} height={240} unoptimized className={projectStyles.mainPhoto} />
                                </div>
                              ) : null}
                            </div>
                            <div className={projectStyles.story}>
                              <div style={{ color: 'var(--white-95)' }} dangerouslySetInnerHTML={{ __html: safeDescription }} />
                              {form.details ? <div style={{ marginTop: 8 }} dangerouslySetInnerHTML={{ __html: (safeDetails || '').slice(0, 400) + ((String(safeDetails || '').length > 400) ? '…' : '') }} /> : null}
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
                          {form.image_path ? <Image src={toPublicUrl(form.image_path) || ''} alt={form.title || 'Project preview image'} width={140} height={100} unoptimized style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:'#9fb7d6'}}>No image</div>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: 'var(--white-95)', marginBottom: 8 }} dangerouslySetInnerHTML={{ __html: safeDescription }} />
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