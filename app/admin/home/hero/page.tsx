"use client"

import React, { useEffect, useState, useRef } from 'react'
import styles from '../../admin.module.css'
import Card from '../../../../components/card/card'

export default function AdminHeroPage() {
  const [hero, setHero] = useState<any | null>(null)
  const [images, setImages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null)
  const autosaveTimer = useRef<number | null>(null)
  const draftKeyRef = useRef<string>('admin_hero_draft:new')
  const [hasDraft, setHasDraft] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/hero')
      const j = await res.json()
      const item = Array.isArray(j.items) && j.items.length ? j.items[0] : null
      setHero(item)
      if (item) {
        const r2 = await fetch(`/api/hero`)
        const j2 = await r2.json()
        setImages(Array.isArray(j2.images) ? j2.images : [])
      } else {
        setImages([])
      }
    } catch (e) {
      console.error('load hero error', e)
    }
    setLoading(false)
  }

  useEffect(()=>{ load() }, [])

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
      await fetch('/api/admin/hero', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      await load()
    } catch (err) { console.error('save hero error', err) }
    setSaving(false)
  }

  async function createHero() {
    setSaving(true)
    try {
      const payload = { title: 'New Hero', subtitle: '', content: '' }
      const res = await fetch('/api/admin/hero', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json()
      setHero(j.item)
      await load()
    } catch (e) { console.error('create hero error', e) }
    setSaving(false)
  }

  async function handleFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    if (!file || !hero) return
    // generate deterministic key under hero/<hero.id>/ to ensure correct folder
    const sanitize = (n = '') => String(n).replace(/[^a-zA-Z0-9._-]/g, '_')
    const ts = Date.now()
    const clean = sanitize(file.name)
    const key = `hero/${hero.id}/${ts}-${clean}`
    try {
      setUploading(true)
      setUploadProgress(0)
      setUploadSuccess(false)
      const pres = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, contentType: file.type }) })
      const pd = await pres.json()
      if (!pd?.url) throw new Error('Presign failed')

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

      const publicUrl = pd.publicUrl || pd.key || key
      // record in DB
      // auto-feature if no featured exists
      const currentlyHasFeatured = images.find((i: any) => Number(i.is_featured) === 1)
      const shouldFeature = !currentlyHasFeatured
      await fetch('/api/admin/hero/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hero_id: hero.id, url: publicUrl, alt: file.name, is_featured: shouldFeature ? 1 : 0 }) })
      setUploadSuccess(true)
      setTimeout(()=> setUploadSuccess(false), 2500)
      setUploadProgress(100)
      await load()
    } catch (err) {
      console.error('upload hero image error', err)
      alert('Upload failed: ' + String(err))
    } finally {
      setUploading(false)
      setUploadProgress(null)
    }
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
      await fetch('/api/admin/hero/image', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, set_featured: true }) })
      await load()
    } catch (e) { console.error(e) }
  }

  async function deleteImage(id: number) {
    try {
      await fetch(`/api/admin/hero/image?id=${encodeURIComponent(String(id))}`, { method: 'DELETE' })
      await load()
    } catch (e) { console.error(e) }
  }

  return (
    <main className="page-pad">
      <div className="center-max">
        <div className={styles.panel}>
          <div className={styles.adminTop}>
            <div>
              <h2 className="title">Home — Hero</h2>
              <div className={styles.smallMuted}>Manage the homepage hero image and text</div>
            </div>
            <div className={styles.topActionsInner}>
              <button className={styles.btnGhost} onClick={load}>Refresh</button>
              {!hero ? <button className={styles.btnGhost} onClick={createHero}>Create hero</button> : <button className={styles.btnGhost} onClick={save} disabled={saving}>{saving ? (<span style={{display:'inline-flex', alignItems:'center', gap:8}}><span className={styles.spinner} style={{width:14, height:14}} />Saving...</span>) : 'Save'}</button>}
              <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end'}}>
                <div style={{display:'flex', gap:8, alignItems:'center'}}>
                  <div className={styles.smallMuted} style={{fontSize:12}}>{draftSavedAt ? `Draft saved ${Math.round((Date.now()-draftSavedAt)/1000)}s ago` : 'No draft'}</div>
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
                {uploading && <div className={styles.smallMuted} style={{fontSize:12}}>Uploading... {uploadProgress != null ? uploadProgress + '%' : ''}</div>}
                {uploadSuccess && <div style={{color:'#7ef0a6', fontSize:12}}>Upload success</div>}
              </div>
            </div>
          </div>

          <div style={{display:'flex', gap:16}}>
            <div style={{flex:1}}>
              <label>
                <div className="field-label">Title</div>
                <input suppressHydrationWarning value={hero?.title || ''} onChange={e=>setHero(h=>({ ...(h||{}), title: e.target.value }))} className={styles.formInput} />
              </label>
              <label>
                <div className="field-label">Subtitle</div>
                <input suppressHydrationWarning value={hero?.subtitle || ''} onChange={e=>setHero(h=>({ ...(h||{}), subtitle: e.target.value }))} className={styles.formInput} />
              </label>
              <label>
                <div className="field-label">Content (HTML allowed)</div>
                <textarea suppressHydrationWarning value={hero?.content || ''} onChange={e=>setHero(h=>({ ...(h||{}), content: e.target.value }))} className={styles.formTextarea} />
              </label>
            </div>
            <div style={{width:360}}>
              <Card>
                <div className={styles.draftHeaderRow}>
                  <div className={styles.draftTitleBold}>Images</div>
                </div>
                <div style={{marginTop:12}}>
                  {/* Featured image section */}
                  {(() => {
                    const featured = images.find((i: any) => Number(i.is_featured) === 1) || null
                    const others = images.filter((i: any) => Number(i.is_featured) !== 1)
                    return (
                      <div>
                        {featured ? (
                          <div style={{marginBottom:12}}>
                            <div className={styles.draftTitleBold}>Featured</div>
                            <div style={{marginTop:8, width:'100%', height:180, overflow:'hidden', borderRadius:10}}>
                              <img src={featured.url} alt={featured.alt||''} style={{width:'100%', height:'100%', objectFit:'cover', display:'block'}} />
                            </div>
                            <div style={{display:'flex', gap:8, marginTop:8}}>
                              <button className={styles.btnGhostSmall} onClick={()=>deleteImage(featured.id)}>Delete</button>
                            </div>
                          </div>
                        ) : (
                          <div className={styles.smallMuted} style={{marginBottom:12}}>No featured image set.</div>
                        )}

                        <div style={{marginTop:6}}>
                          <div className={styles.draftTitleBold}>Other images</div>
                          <div className={styles.imgGallery} style={{marginTop:8}}>
                            {others.map((img: any) => (
                              <div key={img.id} style={{width:120}}>
                                <div style={{width:120, height:80, overflow:'hidden', borderRadius:8}}>
                                  <img src={img.url} alt={img.alt||''} style={{width:'100%', height:'100%', objectFit:'cover', display:'block'}} />
                                </div>
                                <div style={{display:'flex', gap:6, marginTop:6}}>
                                  <button className={styles.btnGhostSmall} onClick={()=>setFeaturedImage(img.id)}>Feature</button>
                                  <button className={styles.btnGhostSmall} onClick={()=>deleteImage(img.id)}>Delete</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                  <div style={{marginTop:12}}>
                    <label className={styles.btnGhost + ' ' + styles.btnGhostSmall} style={{cursor:'pointer'}}>
                      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{display:'none'}} />
                      Upload image
                    </label>
                    <div className={styles.smallMuted} style={{marginTop:8}}>Uploaded images will be stored and can be featured.</div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
