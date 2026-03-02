"use client"

import React, { useEffect, useState } from 'react'
import styles from '../admin.module.css'
import ProjectsList from '../../../components/admin/projects/ProjectsList'
import { useToast } from '../../../components/toast/ToastProvider'

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

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/projects')
    const data = await res.json()
    setItems(data.items || [])
    setLoading(false)
  }

  useEffect(()=>{ load() }, [])
  const toast = useToast()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.slug || !form.title) return
    const metadata: any = form.createDetails ? { details: form.details, images: detailImages } : undefined
    await fetch('/api/admin/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, metadata }) })
    setForm({ slug: '', title: '', subtitle: '', image_path: '', description: '', external_link: '', is_published: true, sort_order: 0, createDetails: false, details: '' })
    setDetailImages([])
    await load()
    try { toast?.showToast && toast.showToast('Project created', 'success') } catch (e) {}
  }

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(id)
  }, [query])

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
      const direct = await fetch('/api/uploads/direct', { method: 'POST', body: fd })
      const d = await direct.json()
      if (direct.ok && d.publicUrl) {
        setForm({...form, image_path: d.publicUrl || d.key})
        return
      }
      console.error('direct upload failed', direct.status, d)
      // fall through to presigned flows below
    } catch (derr: any) {
      console.error('direct upload error', derr)
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
        try { await uploadOne(f) } catch (e:any) { alert('Upload error: ' + String(e?.message || e)); break }
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
                <textarea suppressHydrationWarning rows={6} value={form.description} onChange={e=>setForm({...form, description: e.target.value})} className={styles.formTextarea} />
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
                  <textarea suppressHydrationWarning rows={8} value={form.details} onChange={e=>setForm({...form, details: e.target.value})} className={styles.formTextarea} />
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
                  </div>
                </div>
              </aside>

              <div style={{gridColumn:'1/-1'}}>
                <hr />
                <ProjectsList items={filtered} loading={loading} />
              </div>
            </div>
          </div>
          </div>
        </div>
      </main>
  )
}
