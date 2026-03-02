"use client"

import React, { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from '../../admin.module.css'
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
  const toast = useToast()

  useEffect(()=>{
    (async ()=>{
      const res = await fetch('/api/admin/projects?page=1&limit=1000')
      const data = await res.json()
      const found = (data.items || []).find((p: any)=> String(p.id) === String(id))
      if (found) {
        let md: any = null
        try { md = found.metadata ? JSON.parse(found.metadata) : null } catch (e) { md = null }
        setForm({ id: found.id, slug: found.slug, title: found.title, subtitle: found.subtitle || '', image_path: found.image_path || '', description: found.description || '', external_link: found.external_link || '', is_published: !!found.is_published, sort_order: found.sort_order || 0, details: (md && md.details) || '' })
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
    })()
  }, [id])

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
                  <textarea rows={10} value={form.details} onChange={e=>setForm({...form, details: e.target.value})} className={styles.formTextarea} />
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
                      <img src={form.image_path || ''} alt="Main" style={{width:320, height:200, objectFit:'cover', borderRadius:6, background:'#0b2430'}} />
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
                  <textarea rows={8} value={form.description} onChange={e=>setForm({...form, description: e.target.value})} className={styles.formTextarea} />
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
              <div style={{marginRight:'auto'}} className={styles.smallMuted}>Changes saved automatically on upload; press <span className={styles.kbd}>Ctrl/Cmd+S</span> to save now.</div>
              <div>
                <button className={styles.btnGhost} type="submit">Save</button>
                <button className={styles.btnGhost} type="button" onClick={()=>router.push('/admin/projects')}>Cancel</button>
                <button className={styles.btnDanger} type="button" onClick={remove}>Delete</button>
              </div>
            </div>
          </div>
        </form>
          )}
    </div>
  )
}
