"use client"

import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import styles from '../../admin.module.css'
import Card from '../../../../components/card/card'
import { useToast } from '../../../../components/toast/ToastProvider'
import createDOMPurify from 'dompurify'

type CardData = { title?: string; subtitle?: string; content?: string; image?: string }
type AboutMetadata = {
  summary?: { title?: string; text?: string; cta?: { label?: string; href?: string } }
  // legacy named cards supported for backward-compat; we prefer `cards` array
  aboutCard?: CardData
  topologyCard?: CardData
  hamshackCard?: CardData
  cards?: CardData[]
}

export default function AdminAboutEditor({ params }: { params: any }) {
  // `params` may be a Promise in the App Router — unwrap with React.use when available
  const resolvedParams: any = (React as any).use ? (React as any).use(params) : params
  const idParam = resolvedParams && resolvedParams.id
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [id, setId] = useState<number | null>(null)
  const [slug, setSlug] = useState<string>('')
  const [title, setTitle] = useState('About — KF8FVD')
  const [isPublished, setIsPublished] = useState(true)
  const [metadata, setMetadata] = useState<AboutMetadata>({})

  const [cards, setCards] = useState<CardData[]>([])
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const [uploadProgress, setUploadProgress] = useState<Record<string | number, number>>({})
  const [previewOpen, setPreviewOpen] = useState(false)
  const toast = useToast()

  const draftIdRef = useRef<string | null>(null)
  const draftKey = () => `admin_about_draft:${draftIdRef.current}`

  useEffect(() => { if (!draftIdRef.current) draftIdRef.current = `temp-${Date.now()}` }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/pages?page=1&limit=1000')
      const json = await res.json()
      const items = json?.items || []
      const found = items.find((i: any) => String(i.id) === String(idParam) || String(i.slug) === String(idParam))
      if (found) {
        setId(found.id)
        setSlug(found.slug || '')
        setTitle(found.title || '')
        setIsPublished(Boolean(found.is_published))
        try {
          const md = found.metadata ? (typeof found.metadata === 'string' ? JSON.parse(found.metadata) : found.metadata) : {}
          // If cards array exists, prefer it. Otherwise convert legacy named cards to a cards array so editor works consistently.
          let loadedCards: CardData[] = []
          if (Array.isArray(md.cards) && md.cards.length) {
            loadedCards = md.cards.map((c: any) => ({ title: c?.title || '', subtitle: c?.subtitle || '', content: c?.content || '', image: c?.image || '/headshot.jpg' }))
          } else {
            const about = md.aboutCard || {}
            const topo = md.topologyCard || {}
            const shack = md.hamshackCard || {}
            loadedCards = [
              { title: about.title || found.title || 'About Me', subtitle: about.subtitle || '', content: about.content || found.content || '', image: about.image || '/headshot.jpg' },
              { title: topo.title || 'Home Topology', subtitle: topo.subtitle || 'Hidden Lakes Apartments, Kentwood', content: topo.content || '', image: topo.image || '/apts.jpg' },
              { title: shack.title || 'Ham Shack', subtitle: shack.subtitle || 'Home Radio & Workshop', content: shack.content || '', image: shack.image || '/hamshack.jpg' }
            ]
          }
          setCards(loadedCards)
          setMetadata((prev) => ({ ...prev, ...md }))
        } catch {}
      }
    } catch (e) {
      // ignore
    } finally { setLoading(false) }
  }

  useEffect(()=>{ const t = setTimeout(load, 0); return ()=>clearTimeout(t) }, [idParam])

  // autosave locally (debounced)
  const autosaveTimer = useRef<number | null>(null)
  useEffect(()=>{
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
    autosaveTimer.current = window.setTimeout(()=>{
      try {
        const payload = { slug, title, metadata: { ...metadata, cards }, id, updated: Date.now() }
        localStorage.setItem(draftKey(), JSON.stringify(payload))
        try { toast?.showToast && toast.showToast('Draft saved locally', 'info') } catch{}
      } catch {}
    }, 800)
    return ()=>{ if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current) }
  }, [slug, title, metadata, id])

  // restore temp draft
  useEffect(()=>{
    try {
      const key = `admin_about_draft:${draftIdRef.current}`
      const raw = localStorage.getItem(key)
      if (raw) {
        const p = JSON.parse(raw)
        if (p) { setTitle(p.title || title); if (p.id) setId(p.id); if (p.slug) setSlug(p.slug); if (p.metadata) setMetadata(p.metadata); try{ toast?.showToast && toast.showToast('Restored unsaved draft', 'info') }catch{} }
      }
    } catch {}
  }, [])

  const loadDraft = ()=>{
    try {
      const key = `admin_about_draft:about`
      const raw = localStorage.getItem(key)
      if (!raw) return
      const p = JSON.parse(raw)
      if (p) { setTitle(p.title || title); if (p.id) setId(p.id); if (p.slug) setSlug(p.slug); if (p.metadata) setMetadata(p.metadata); }
    } catch {}
  }

  const discardDraft = ()=>{ try{ localStorage.removeItem(draftKey()); localStorage.removeItem('admin_about_draft:about') }catch{}; load(); try{ toast?.showToast && toast.showToast('Draft discarded', 'info') }catch{} }

  const updateMetadata = (path: string[], value: any) => {
    setMetadata((prev: any)=>{
      const next = JSON.parse(JSON.stringify(prev || {}))
      let cur = next
      for (let i=0;i<path.length-1;i++){ const k = path[i]; if (!cur[k]) cur[k] = {}; cur = cur[k] }
      cur[path[path.length-1]] = value
      return next
    })
  }

  const addCard = () => setCards(prev => ([...prev, { title: 'Untitled', subtitle: '', content: '', image: '/headshot.jpg' }]))
  const removeCard = (idx: number) => setCards(prev => prev.filter((_,i)=>i!==idx))
  const moveCard = (idx: number, dir: number) => {
    setCards(prev => {
      const copy = prev.slice()
      const to = idx + dir
      if (to < 0 || to >= copy.length) return prev
      const tmp = copy[to]
      copy[to] = copy[idx]
      copy[idx] = tmp
      return copy
    })
  }
  const updateCard = (idx: number, key: keyof CardData, value: any) => {
    setCards(old => {
      const copy = old.slice()
      if (idx < 0 || idx >= copy.length) return old
      copy[idx] = { ...copy[idx], ...(copy[idx] as any), [key]: value }
      return copy
    })
  }

  // keep contentEditable DOM in sync for dynamic cards when not focused
  useEffect(()=>{
    try{
      for (let i = 0; i < cards.length; i++) {
        const el = cardRefs.current[i]
        if (el && document.activeElement !== el) {
          const desired = cards[i]?.content || ''
          if (el.innerHTML !== desired) el.innerHTML = desired
        }
      }
    }catch{}
  }, [cards])

  // Ctrl/Cmd+S save
  useEffect(()=>{
    const handler = (ev: KeyboardEvent)=>{ if ((ev.ctrlKey||ev.metaKey) && ev.key.toLowerCase()==='s') { ev.preventDefault(); handleSave() } }
    window.addEventListener('keydown', handler)
    return ()=>window.removeEventListener('keydown', handler)
  }, [slug, title, metadata, id, isPublished])

  const getErrMsg = (err: unknown) => { if (err instanceof Error) return err.message; try { return String(err) } catch { return 'Unknown error' } }

  async function handleSave() {
    setSaving(true)
    try{
      const safeMetadata = { ...metadata, cards }
      const payload: any = { id, slug: slug || undefined, title, content: '', metadata: safeMetadata, is_published: isPublished ? 1 : 0 }
      const method = id ? 'PUT' : 'POST'
      const res = await fetch('/api/admin/pages', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const err = await res.json().catch(()=>({})); alert('Save failed: ' + (err?.error || res.status)); return }
      const json = await res.json()
      if (!id && json?.id) setId(json.id)
      try { localStorage.removeItem(draftKey()); localStorage.removeItem('admin_about_draft:about') } catch{}
      try { toast?.showToast && toast.showToast('Saved', 'success') } catch{}
    }catch(e){ alert('Save failed: ' + getErrMsg(e)) } finally { setSaving(false) }
  }

  // upload card image for a specific card index (tries direct server upload then presign PUT, falls back)
  async function uploadCardImageIndex(file: File, idx: number){
    if (!file) return
    const MAX_BYTES = 50 * 1024 * 1024
    if (file.size > MAX_BYTES) { alert('File too large (max 50MB)'); return }
    setUploadProgress(p=>({ ...p, [idx]: -1 }))
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('slug',String(slug||'about')); fd.append('filename', file.name)
      const direct = await fetch('/api/uploads/direct', { method: 'POST', body: fd })
      const d = await direct.json()
      if (direct.ok && d.publicUrl) { updateCard(idx, 'image', d.publicUrl || d.key); setUploadProgress(p=>({ ...p, [idx]: 0 })); try{ toast?.showToast && toast.showToast('Image uploaded','success') }catch{}; return }
    } catch (err) { console.error('direct upload error', getErrMsg(err)) }

    // presign
    try{
      const res = await fetch('/api/uploads', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ slug:String(slug||'about'), filename: file.name, contentType: file.type }) })
      const data = await res.json()
      if (!data.url) { alert('Upload presign failed: ' + (data.error || 'unknown')); setUploadProgress(p=>({ ...p, [idx]: 0 })); return }

      // PUT to presigned URL
      const upload = await fetch(data.url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!upload.ok) {
        // fallback to server direct
        const fd2 = new FormData(); fd2.append('file', file); fd2.append('slug',String(slug||'about')); fd2.append('filename', file.name)
        try { const direct2 = await fetch('/api/uploads/direct', { method:'POST', body: fd2 }); const j = await direct2.json(); if (direct2.ok && j.publicUrl) { updateCard(idx, 'image', j.publicUrl || j.key); setUploadProgress(p=>({ ...p, [idx]: 0 })); try{ toast?.showToast && toast.showToast('Image uploaded','success') }catch{}; return } } catch(e){ console.error('direct fallback error', getErrMsg(e)) }
        alert('Upload failed')
        setUploadProgress(p=>({ ...p, [idx]: 0 })); return
      }

      updateCard(idx, 'image', data.publicUrl || data.key)
      setUploadProgress(p=>({ ...p, [idx]: 0 }))
      try{ toast?.showToast && toast.showToast('Image uploaded','success') }catch{}
    } catch (err) { console.error('upload error', getErrMsg(err)); setUploadProgress(p=>({ ...p, [idx]: 0 })); alert('Upload failed: ' + getErrMsg(err)) }
  }

  // keep a wrapper that preserves backward compatibility with old card keys
  async function uploadCardImage(file: File, cardKey: 'aboutCard'|'topologyCard'|'hamshackCard'){
    // find index for legacy key if possible
    const mapping: Record<string, number> = { aboutCard: 0, topologyCard: 1, hamshackCard: 2 }
    const idx = mapping[cardKey] ?? 0
    return uploadCardImageIndex(file, idx)
  }

  if (loading) return <div className="page-pad" style={{padding:20}}>Loading…</div>

  return (
    <main className="page-pad">
      <div className="center-max">
        <div className={styles.panel}>
          <h2>About Editor</h2>
          <div className="stack">
            <div className={styles.editorGrid}>
              <div>
                <form className="form-grid" onSubmit={(e)=>{ e.preventDefault(); handleSave() }}>
                  <label>
                    <div className="field-label">Slug</div>
                    <input value={slug} onChange={e=>setSlug(e.target.value)} className={styles.formInput} />
                  </label>
                  <label>
                    <div className="field-label">Title</div>
                    <input value={title} onChange={e=>setTitle(e.target.value)} className={styles.formInput} />
                  </label>
                  <div>
                    <div className="field-label">Published</div>
                    <label className={styles.switch + ' ' + styles.switchSmall}>
                      <input type="checkbox" checked={isPublished} onChange={e=>setIsPublished(e.target.checked)} />
                      <span className={`${styles.slider} ${isPublished ? styles.on : ''}`} />
                      <span className={styles.switchLabel}>{isPublished ? 'Published' : 'Draft'}</span>
                    </label>
                  </div>

                  <section style={{marginTop:8}}>
                    <h3>Summary</h3>
                    <label>
                      <div className="field-label">Heading</div>
                      <input value={metadata.summary?.title || ''} onChange={e=>updateMetadata(['summary','title'], e.target.value)} className={styles.formInput} />
                    </label>
                    <label>
                      <div className="field-label">Text</div>
                      <textarea value={metadata.summary?.text || ''} onChange={e=>updateMetadata(['summary','text'], e.target.value)} rows={3} className={styles.formInput} />
                    </label>
                    <label>
                      <div className="field-label">CTA Label</div>
                      <input value={metadata.summary?.cta?.label || ''} onChange={e=>updateMetadata(['summary','cta','label'], e.target.value)} className={styles.formInput} />
                    </label>
                    <label>
                      <div className="field-label">CTA Href</div>
                      <input value={metadata.summary?.cta?.href || ''} onChange={e=>updateMetadata(['summary','cta','href'], e.target.value)} className={styles.formInput} />
                    </label>
                  </section>

                  <section style={{marginTop:12}}>
                    <h3>Cards</h3>
                    <div style={{display:'flex', flexDirection:'column', gap:12}}>
                      {cards.map((card, idx) => (
                        <div key={idx} style={{border:'1px solid rgba(255,255,255,0.06)', borderRadius:8, padding:8, background:'var(--card-bg)'}}>
                          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                            <div style={{fontWeight:700}}>{card.title || `Card ${idx+1}`}</div>
                            <div style={{display:'flex', gap:8}}>
                              <button type="button" className={styles.btnGhost} onClick={()=>moveCard(idx, -1)} disabled={idx===0}>↑</button>
                              <button type="button" className={styles.btnGhost} onClick={()=>moveCard(idx, 1)} disabled={idx===cards.length-1}>↓</button>
                              <button type="button" className={styles.btnDanger} onClick={()=>removeCard(idx)}>Remove</button>
                            </div>
                          </div>
                          <label>
                            <div className="field-label">Title</div>
                            <input value={card.title || ''} onChange={e=>updateCard(idx, 'title', e.target.value)} className={styles.formInput} />
                          </label>
                          <label>
                            <div className="field-label">Subtitle</div>
                            <input value={card.subtitle || ''} onChange={e=>updateCard(idx, 'subtitle', e.target.value)} className={styles.formInput} />
                          </label>
                          <label>
                            <div className="field-label">Image path</div>
                            <input value={card.image || ''} onChange={e=>updateCard(idx, 'image', e.target.value)} className={styles.formInput} />
                            <div style={{marginTop:8}}>
                              <label className={styles.btnGhost + ' ' + styles.btnGhostSmall} style={{display:'inline-flex',alignItems:'center',gap:8}}>
                                <input type="file" accept="image/*" style={{display:'none'}} onChange={(e)=>{ const f = e.currentTarget.files?.[0]; if (f) uploadCardImageIndex(f, idx) }} />
                                Upload image
                              </label>
                              {uploadProgress[idx] && uploadProgress[idx] < 0 ? <div style={{color:'#9fb7d6'}}>Uploading…</div> : uploadProgress[idx] ? <div className="progress-bar" style={{width:120}}><div className="progress-bar-inner" style={{width:`${uploadProgress[idx]}%`}}/></div> : null}
                            </div>
                          </label>
                          <label>
                            <div className="field-label">Content (HTML allowed)</div>
                            <div style={{border:'1px solid rgba(255,255,255,0.06)', borderRadius:8, padding:8, background:'var(--card-bg)'}}>
                              <div style={{display:'flex',gap:8,marginBottom:8}}>
                                <button type="button" className={styles.btnGhost} onClick={()=>{ const el = cardRefs.current[idx]; if (!el) return; el.focus(); document.execCommand('bold'); setTimeout(()=>updateCard(idx,'content', el.innerHTML||''), 0) }}>B</button>
                                <button type="button" className={styles.btnGhost} onClick={()=>{ const el = cardRefs.current[idx]; if (!el) return; el.focus(); document.execCommand('italic'); setTimeout(()=>updateCard(idx,'content', el.innerHTML||''), 0) }}>I</button>
                                <button type="button" className={styles.btnGhost} onClick={()=>{ const el = cardRefs.current[idx]; if (!el) return; el.focus(); document.execCommand('insertUnorderedList'); setTimeout(()=>updateCard(idx,'content', el.innerHTML||''), 0) }}>• List</button>
                                <button type="button" className={styles.btnGhost} onClick={()=>{ const el = cardRefs.current[idx]; if (!el) return; const url = prompt('Insert link URL'); if (url){ el.focus(); document.execCommand('createLink', false, url); setTimeout(()=>updateCard(idx,'content', el.innerHTML||''), 0) } }}>🔗</button>
                                <button type="button" className={styles.btnGhost} onClick={()=>updateCard(idx,'content','')}>Clear</button>
                              </div>
                              <div ref={(el)=>{ cardRefs.current[idx] = el }} contentEditable suppressContentEditableWarning className={styles.formTextarea} onInput={(e)=>{ updateCard(idx,'content', (e.currentTarget as HTMLDivElement).innerHTML || '') }} style={{minHeight:200, maxHeight:800, overflow:'auto'}} dangerouslySetInnerHTML={{ __html: card.content || '' }} />
                            </div>
                          </label>
                        </div>
                      ))}
                      <div>
                        <button type="button" className={styles.btnGhost} onClick={addCard}>Add Card</button>
                      </div>
                    </div>
                  </section>

                  <div style={{display:'flex',gap:8,marginTop:12}}>
                    <button type="submit" className={styles.btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
                    <button type="button" className={styles.btnGhost} onClick={()=>window.open('/aboutme','_blank')}>Preview</button>
                    <button type="button" className={styles.btnGhost} onClick={loadDraft}>Load Draft</button>
                    <button type="button" className={styles.btnDanger} onClick={discardDraft}>Discard Draft</button>
                  </div>
                </form>
              </div>

              <aside>
                <div className={styles.panel} style={{padding:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div className={styles.fieldLabel}>About Page</div>
                      <div className="muted">Edit the three cards and summary content</div>
                    </div>
                    <div>
                      <button className={styles.btnGhost} onClick={load}>Refresh</button>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
