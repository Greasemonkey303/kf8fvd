"use client"

import React, { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import styles from '../../admin.module.css'
import projectStyles from '../../../projects/hotspot/hotspot.module.css'
import Card from '../../../../components/card/card'
import ProjectEditorSidebar from '../../../../components/admin/projects/ProjectEditorSidebar'
import { useToast } from '../../../../components/toast/ToastProvider'
import createDOMPurify from 'dompurify'
import { buildPublicUrl } from '../../../../lib/s3'

type CardData = { title?: string; subtitle?: string; content?: string; image?: string; images?: string[]; templateLarge?: string; templateSmall?: string }
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

  const searchParams = useSearchParams()
  const [activeIdx, setActiveIdx] = useState<number>(0)

  // single-card editor convenience state (gallery + form-like API used by ProjectEditorSidebar)
  const [images, setImages] = useState<string[]>([])
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [editorExpanded, setEditorExpanded] = useState(false)
  const descRef = useRef<HTMLDivElement | null>(null)
  const [descExpanded, setDescExpanded] = useState(false)
  const purify = typeof window !== 'undefined' ? createDOMPurify(window as unknown as Window & typeof globalThis) : null

  const [uploadProgress, setUploadProgress] = useState<Record<string | number, number>>({})
  const [previewOpen, setPreviewOpen] = useState(false)
  const toast = useToast()
  const [savedPageJson, setSavedPageJson] = useState<any | null>(null)

  const draftKey = (idOrSlug?: string) => `admin_about_draft:${idOrSlug || slug || (id ? `about-${id}` : 'about')}`

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
            loadedCards = md.cards.map((c: any) => ({ title: c?.title || '', subtitle: c?.subtitle || '', content: c?.content || '', image: c?.image || '/headshot.jpg', images: Array.isArray(c?.images) ? (c.images as string[]) : (c?.image ? [c.image] : []), templateLarge: c?.templateLarge || '', templateSmall: c?.templateSmall || '' }))
          } else {
            const about = md.aboutCard || {}
            const topo = md.topologyCard || {}
            const shack = md.hamshackCard || {}
            loadedCards = [
              { title: about.title || found.title || 'About Me', subtitle: about.subtitle || '', content: about.content || found.content || '', image: about.image || '/headshot.jpg', images: about.image ? [about.image] : [], templateLarge: about.templateLarge || '', templateSmall: about.templateSmall || '' },
              { title: topo.title || 'Home Topology', subtitle: topo.subtitle || 'Hidden Lakes Apartments, Kentwood', content: topo.content || '', image: topo.image || '/apts.jpg', images: topo.image ? [topo.image] : [], templateLarge: topo.templateLarge || '', templateSmall: topo.templateSmall || '' },
              { title: shack.title || 'Ham Shack', subtitle: shack.subtitle || 'Home Radio & Workshop', content: shack.content || '', image: shack.image || '/hamshack.jpg', images: shack.image ? [shack.image] : [], templateLarge: shack.templateLarge || '', templateSmall: shack.templateSmall || '' }
            ]
          }
          // determine which card index to open (from search param `card`)
          let requestedIndex = 0
          try {
            const cp = searchParams?.get('card')
            if (cp !== null && cp !== undefined) {
              if (cp === 'about') requestedIndex = 0
              else if (cp === 'topology') requestedIndex = 1
              else if (cp === 'hamshack') requestedIndex = 2
              else {
                const parsed = parseInt(cp as any, 10)
                if (!Number.isNaN(parsed)) requestedIndex = parsed
              }
            }
          } catch {}
          if (requestedIndex < 0) requestedIndex = 0
          if (requestedIndex >= loadedCards.length) requestedIndex = Math.max(0, loadedCards.length - 1)
          setCards(loadedCards)
          setActiveIdx(requestedIndex)
          // populate gallery images from the active card's images (prefer card-local gallery), fall back to metadata.images or the card's image
          const activeCard = loadedCards[requestedIndex] || ({} as CardData)
          const cardImgs: string[] = (Array.isArray(activeCard.images) && activeCard.images.length) ? activeCard.images : (Array.isArray(md.images) ? md.images : (activeCard.image ? [activeCard.image] : []))
          setImages(cardImgs.slice(0,6))
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

  // restore any draft available (try slug/id-specific, then generic)
  useEffect(()=>{
    try {
      const keysToTry = [draftKey(), draftKey('about'), `admin_about_draft:about-${id}`]
      for (const key of keysToTry) {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        try {
          const p = JSON.parse(raw)
          if (p) {
            setTitle(p.title || title)
            if (p.id) setId(p.id)
            if (p.slug) setSlug(p.slug)
            if (p.metadata) setMetadata(p.metadata)
            try{ toast?.showToast && toast.showToast('Restored unsaved draft', 'info') }catch{}
            break
          }
        } catch {}
      }
    } catch {}
  }, [])

  const loadDraft = ()=>{
    try {
      const key = draftKey()
      const raw = localStorage.getItem(key) || localStorage.getItem('admin_about_draft:about')
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

  // Project-like sidebar helpers (operate on the first/about card)
  const setFormLike = (val: any) => {
    // Accept updater function or plain object and operate on the active card index
    const idx = Number.isInteger(activeIdx) ? activeIdx : 0
    const cardAt = cards[idx] || {}
    const current = {
      id,
      slug,
      title,
      subtitle: cardAt?.subtitle || '',
      image_path: cardAt?.image || '',
      templateLarge: cardAt?.templateLarge || '',
      templateSmall: cardAt?.templateSmall || '',
      description: metadata.summary?.text || '',
      is_published: isPublished,
      details: cardAt?.content || ''
    }
    const next = typeof val === 'function' ? val(current) : { ...current, ...val }
    if (next.slug !== undefined) setSlug(next.slug)
    if (next.title !== undefined) setTitle(next.title)
    if (next.image_path !== undefined) updateCard(idx, 'image', next.image_path)
    if (next.image_path !== undefined) {
      // ensure card gallery includes this image and main image is set
      setCards(prev => {
        const copy = prev.slice()
        const card = copy[idx] || { title:'', subtitle:'', content:'', image: next.image_path, images: [] as string[] }
        const imgs = Array.isArray(card.images) ? card.images.slice() : []
        if (next.image_path && !imgs.includes(next.image_path)) imgs.push(next.image_path)
        card.images = imgs
        card.image = next.image_path
        copy[idx] = card
        return copy
      })
      setImages(prev => { const nextImgs = prev.slice(); if (next.image_path && !nextImgs.includes(next.image_path)) nextImgs.push(next.image_path); return nextImgs })
    }
    if (next.subtitle !== undefined) updateCard(idx, 'subtitle', next.subtitle)
    if (next.details !== undefined) updateCard(idx, 'content', next.details)
    if (next.description !== undefined) updateMetadata(['summary','text'], next.description)
    if (next.templateLarge !== undefined) updateCard(idx, 'templateLarge', next.templateLarge)
    if (next.templateSmall !== undefined) updateCard(idx, 'templateSmall', next.templateSmall)
    if (next.is_published !== undefined) setIsPublished(!!next.is_published)
  }

  

  const editMainImage = async () => {
    const cur = cards[activeIdx]?.image || ''
    const val = prompt('Edit main image URL', cur)
    if (val === null) return
    updateCard(activeIdx, 'image', val)
    try { await handleSave() } catch {}
  }

  const uploadMainImage = async (file: File | null) => {
    if (!file) return
    await uploadCardImageIndex(file, activeIdx)
  }

  const deleteMainImage = async () => {
    const src = cards[activeIdx]?.image
    if (!src) return
    if (!confirm('Delete the main image from storage and clear Image path?')) return
    try { await fetch('/api/uploads/delete', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ url: src }) }) } catch {}
    updateCard(activeIdx, 'image', '')
    try { await handleSave() } catch {}
  }

  const uploadFiles = (files: FileList | null | undefined) => {
    if (!files) return
    for (const f of Array.from(files)) { uploadCardImageIndex(f, activeIdx).catch(()=>{}) }
  }

  const moveImage = (idx: number, dir: number) => {
    // reorder images for the current card (cards[0]) and update local images state
    setCards(prev => {
      const copy = prev.slice()
      const card = copy[activeIdx] || { images: [] as string[] }
      const imgs = Array.isArray(card.images) ? card.images.slice() : images.slice()
      const to = idx + dir
      if (to < 0 || to >= imgs.length) return prev
      const tmp = imgs[to]
      imgs[to] = imgs[idx]
      imgs[idx] = tmp
      card.images = imgs
      copy[activeIdx] = card
      return copy
    })
    setImages(prev => {
      const copy = prev.slice()
      const to = idx + dir
      if (to < 0 || to >= copy.length) return copy
      const tmp = copy[to]
      copy[to] = copy[idx]
      copy[idx] = tmp
      return copy
    })
  }

  const editImage = (idx: number) => {
    const cur = images[idx]
    const val = prompt('Edit image URL', cur)
    if (val === null) return
    setCards(prev => {
      const copy = prev.slice()
      const card = copy[activeIdx] || { images: [] as string[] }
      const imgs = Array.isArray(card.images) ? card.images.slice() : images.slice()
      imgs[idx] = val
      card.images = imgs
      copy[activeIdx] = card
      return copy
    })
    setImages(prev => { const copy = prev.slice(); copy[idx] = val; return copy })
  }

  const deleteImage = async (idx: number) => {
    const src = images[idx]
    if (!src) return
    if (!confirm('Delete this image from storage and remove from gallery?')) return
    try { await fetch('/api/uploads/delete', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ url: src }) }) } catch {}
    // remove from card images
    setCards(prev => {
      const copy = prev.slice()
      const card = copy[activeIdx] || { images: [] as string[] }
      const imgs = Array.isArray(card.images) ? card.images.slice() : images.slice()
      const next = imgs.filter((_,i)=>i!==idx)
      card.images = next
      // clear main image if it matched
      if (card.image === src) card.image = ''
      copy[activeIdx] = card
      return copy
    })
    setImages(prev => prev.filter((_,i)=>i!==idx))
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

  // keep main editorRef (alias to the active card's editor) in sync when cards or active index change
  useEffect(()=>{
    try{
      if (editorRef.current && document.activeElement !== editorRef.current) {
        const desired = cards[activeIdx]?.content || ''
        if ((editorRef.current.innerHTML || '') !== desired) editorRef.current.innerHTML = desired
      }
    }catch{}
  }, [cards, activeIdx])

  // keep images state in sync with the active card's gallery
  useEffect(()=>{
    try{
      const imgs = Array.isArray(cards[activeIdx]?.images) && cards[activeIdx]?.images.length ? (cards[activeIdx]?.images as string[]).slice(0,6) : (cards[activeIdx]?.image ? [cards[activeIdx].image] : [])
      const prev = images || []
      const a = JSON.stringify(prev)
      const b = JSON.stringify(imgs)
      if (a !== b) setImages(imgs)
    }catch{}
  }, [cards, activeIdx])

  // keep summary editor in sync when metadata.summary.text changes
  useEffect(()=>{
    try{
      if (descRef.current && document.activeElement !== descRef.current) {
        const desired = metadata.summary?.text || ''
        if ((descRef.current.innerHTML || '') !== desired) descRef.current.innerHTML = desired
      }
    }catch{}
  }, [metadata.summary?.text])

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
      if (direct.ok && (d.publicUrl || d.key)) {
        const url = d.key ? buildPublicUrl(d.key) : (d.publicUrl || d.key)
        updateCard(idx, 'image', url)
        // add to the card's gallery
        setCards(prev => {
          const copy = prev.slice()
          const card = copy[idx] || { title: '', subtitle: '', content: '', image: url, images: [] as string[] }
          const imgs = Array.isArray(card.images) ? card.images.slice() : []
          if (!imgs.includes(url)) imgs.push(url)
          card.images = imgs
          copy[idx] = card
          return copy
        })
        if (idx === activeIdx) setImages(prev => { const next = prev.slice(); if (!next.includes(url)) next.push(url); return next })
        setUploadProgress(p=>({ ...p, [idx]: 0 })); try{ toast?.showToast && toast.showToast('Image uploaded','success') }catch{}; return
      }
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
        try { const direct2 = await fetch('/api/uploads/direct', { method:'POST', body: fd2 }); const j = await direct2.json(); if (direct2.ok && (j.publicUrl || j.key)) { const jurl = j.key ? buildPublicUrl(j.key) : (j.publicUrl || j.key); updateCard(idx, 'image', jurl); setUploadProgress(p=>({ ...p, [idx]: 0 })); try{ toast?.showToast && toast.showToast('Image uploaded','success') }catch{}; return } } catch(e){ console.error('direct fallback error', getErrMsg(e)) }
        alert('Upload failed')
        setUploadProgress(p=>({ ...p, [idx]: 0 })); return
      }

      const newUrl = data.key ? buildPublicUrl(data.key) : (data.publicUrl || data.key)
      updateCard(idx, 'image', newUrl)
      // add to the card's gallery
      setCards(prev => {
        const copy = prev.slice()
        const card = copy[idx] || { title: '', subtitle: '', content: '', image: newUrl, images: [] as string[] }
        const imgs = Array.isArray(card.images) ? card.images.slice() : []
        if (newUrl && !imgs.includes(newUrl)) imgs.push(newUrl)
        card.images = imgs
        copy[idx] = card
        return copy
      })
      if (idx === activeIdx && newUrl) setImages(prev => { if (prev.includes(newUrl)) return prev; return [...prev, newUrl] })
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

  if (loading) return <div style={{padding:20}}>Loading…</div>

  return (
    <div>
      <div style={{marginBottom:12}} className={styles.topTitle}>Edit About — ID: {id ?? idParam} <span style={{marginLeft:8}} className={styles.kbd}>Ctrl/Cmd+S</span></div>
      <div style={{marginBottom:12}}>
        <button className={styles.btnGhost} onClick={load}>Refresh</button>
        <button className={styles.btnGhost} onClick={async ()=>{
          try {
            const q = id ? `?id=${encodeURIComponent(String(id))}` : `?slug=${encodeURIComponent(slug || 'about')}`
            const res = await fetch('/api/admin/pages' + q)
            const j = await res.json()
            setSavedPageJson(j)
          } catch (e) {
            alert('Could not fetch saved page')
          }
        }} style={{marginLeft:8}}>Show saved metadata</button>
      </div>

      {savedPageJson ? (
        <div style={{marginBottom:12, background:'rgba(0,0,0,0.04)', padding:12, borderRadius:8}}>
          <strong>Saved page JSON</strong>
          <pre style={{whiteSpace:'pre-wrap', maxHeight:240, overflow:'auto', marginTop:8}}>{JSON.stringify(savedPageJson, null, 2)}</pre>
        </div>
      ) : null}
      {loading ? <p>Loading…</p> : (
        <form className={styles.editorGrid} onSubmit={(e)=>{ e.preventDefault(); handleSave() }}>
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
                      <div style={{marginBottom:8}} className={styles.smallMuted}>This is the summary text shown on the About page.</div>
                      <div style={{border:'1px solid rgba(255,255,255,0.06)', borderRadius:8, padding:8, background:'var(--card-bg)'}}>
                        <div style={{display:'flex', gap:8, marginBottom:8}}>
                          <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('bold'); setTimeout(()=>updateMetadata(['summary','text'], descRef.current?.innerHTML || ''), 0); }} title="Bold">B</button>
                          <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('italic'); setTimeout(()=>updateMetadata(['summary','text'], descRef.current?.innerHTML || ''), 0); }} title="Italic">I</button>
                          <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('insertUnorderedList'); setTimeout(()=>updateMetadata(['summary','text'], descRef.current?.innerHTML || ''), 0); }} title="Bullet list">• List</button>
                          <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; descRef.current.focus(); document.execCommand('insertOrderedList'); setTimeout(()=>updateMetadata(['summary','text'], descRef.current?.innerHTML || ''), 0); }} title="Numbered list">1. List</button>
                          <button type="button" className={styles.btnGhost} onClick={() => { if (!descRef.current) return; const url = prompt('Insert link URL'); if (url) { descRef.current.focus(); document.execCommand('createLink', false, url); setTimeout(()=>updateMetadata(['summary','text'], descRef.current?.innerHTML || ''), 0); } }} title="Insert link">🔗</button>
                          <button type="button" className={styles.btnGhost} onClick={() => setDescExpanded(v => !v)} title="Expand editor">⤢</button>
                        </div>
                        <div id="about-summary-editor" ref={descRef} contentEditable suppressContentEditableWarning className={styles.formTextarea} onInput={(e)=>{ updateMetadata(['summary','text'], (e.currentTarget as HTMLDivElement).innerHTML || '') }} style={{minHeight: descExpanded ? 520 : 360, maxHeight:900, overflow:'auto', resize:'vertical'}} dangerouslySetInnerHTML={{ __html: metadata.summary?.text || '' }} />
                      </div>
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
                    <h3>About Card</h3>
                    <div style={{display:'flex', gap:12}}>
                      <div style={{flex:1}}>
                        {cards[activeIdx] ? (
                          <div style={{border:'1px solid rgba(255,255,255,0.06)', borderRadius:8, padding:8, background:'var(--card-bg)'}}>
                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                              <div style={{fontWeight:700}}>{cards[activeIdx].title || 'About Card'}</div>
                            </div>
                            <label>
                              <div className="field-label">Card Title</div>
                              <input value={cards[activeIdx]?.title || ''} onChange={e=>updateCard(activeIdx, 'title', e.target.value)} className={styles.formInput} />
                            </label>
                            <label>
                              <div className="field-label">Subtitle</div>
                              <input value={cards[activeIdx]?.subtitle || ''} onChange={e=>updateCard(activeIdx, 'subtitle', e.target.value)} className={styles.formInput} />
                            </label>
                            <label>
                              <div className="field-label">Content (HTML allowed)</div>
                              <div style={{border:'1px solid rgba(255,255,255,0.06)', borderRadius:8, padding:8, background:'var(--card-bg)'}}>
                                <div style={{display:'flex', gap:8, marginBottom:8}}>
                                  <button type="button" className={styles.btnGhost} onClick={()=>{ const el = cardRefs.current[activeIdx]; if (!el) return; el.focus(); document.execCommand('bold'); setTimeout(()=>updateCard(activeIdx,'content', el.innerHTML||''), 0) }}>B</button>
                                  <button type="button" className={styles.btnGhost} onClick={()=>{ const el = cardRefs.current[activeIdx]; if (!el) return; el.focus(); document.execCommand('italic'); setTimeout(()=>updateCard(activeIdx,'content', el.innerHTML||''), 0) }}>I</button>
                                  <button type="button" className={styles.btnGhost} onClick={()=>{ const el = cardRefs.current[activeIdx]; if (!el) return; el.focus(); document.execCommand('insertUnorderedList'); setTimeout(()=>updateCard(activeIdx,'content', el.innerHTML||''), 0) }}>• List</button>
                                  <button type="button" className={styles.btnGhost} onClick={()=>{ const el = cardRefs.current[activeIdx]; if (!el) return; const url = prompt('Insert link URL'); if (url){ el.focus(); document.execCommand('createLink', false, url); setTimeout(()=>updateCard(activeIdx,'content', el.innerHTML||''), 0) } }}>🔗</button>
                                  <button type="button" className={styles.btnGhost} onClick={()=>{ const el = cardRefs.current[activeIdx]; if (!el) return; el.focus(); document.execCommand('undo'); setTimeout(()=>updateCard(activeIdx,'content', el.innerHTML||''), 0) }}>↶</button>
                                  <button type="button" className={styles.btnGhost} onClick={()=>{ const el = cardRefs.current[activeIdx]; if (!el) return; el.focus(); document.execCommand('redo'); setTimeout(()=>updateCard(activeIdx,'content', el.innerHTML||''), 0) }}>↷</button>
                                  <button type="button" className={styles.btnGhost} onClick={()=>setEditorExpanded(v=>!v)}>⤢</button>
                                </div>
                                <div ref={(el)=>{ cardRefs.current[activeIdx] = el }} id="about-card-editor" contentEditable suppressContentEditableWarning className={styles.formTextarea} onInput={(e)=>{ updateCard(activeIdx,'content', (e.currentTarget as HTMLDivElement).innerHTML || '') }} style={{minHeight: editorExpanded ? 600 : 320, maxHeight:1200, overflow:'auto', resize:'vertical'}} dangerouslySetInnerHTML={{ __html: cards[activeIdx]?.content || '' }} />
                              </div>
                            </label>
                          </div>
                        ) : null}
                      </div>

                      <ProjectEditorSidebar
                        form={{ id: id ?? undefined, slug, title, subtitle: cards[activeIdx]?.subtitle || '', image_path: cards[activeIdx]?.image || '', templateLarge: cards[activeIdx]?.templateLarge || '', templateSmall: cards[activeIdx]?.templateSmall || '', description: metadata.summary?.text || '', is_published: isPublished, details: cards[activeIdx]?.content || '' }}
                        setForm={setFormLike}
                        images={images}
                        uploadMainImage={uploadMainImage}
                        editMainImage={editMainImage}
                        deleteMainImage={deleteMainImage}
                        uploadFiles={uploadFiles}
                        uploadProgress={uploadProgress[activeIdx] || 0}
                        moveImage={moveImage}
                        editImage={editImage}
                        deleteImage={deleteImage}
                        onRemove={async ()=>{
                          if (!id) return
                          try {
                            // If this page has multiple cards, delete just the active card
                            const hasCardsArray = Array.isArray(metadata?.cards) && metadata?.cards.length > 0
                            if (hasCardsArray && cards.length > 1) {
                              if (!confirm('Delete this card?')) return
                              const res = await fetch(`/api/admin/pages?id=${id}&card=${activeIdx}`, { method: 'DELETE' })
                              if (!res.ok) { alert('Delete failed'); return }
                              // remove locally
                              setCards(prev => {
                                const copy = prev.slice()
                                copy.splice(activeIdx, 1)
                                return copy
                              })
                              setActiveIdx(i => Math.max(0, Math.min(i, Math.max(0, cards.length - 2))))
                              // sync images for new active card
                              setImages(prev => {
                                const nextCards = cards.slice(); nextCards.splice(activeIdx, 1)
                                const newCard = nextCards[Math.max(0, Math.min(activeIdx, Math.max(0, nextCards.length - 1)))]
                                if (!newCard) return []
                                return (Array.isArray(newCard.images) && newCard.images.length) ? (newCard.images as string[]).slice(0,6) : (newCard.image ? [newCard.image] : [])
                              })
                              try { toast?.showToast && toast.showToast('Card deleted', 'success') } catch {}
                              return
                            }

                            // Legacy named cards: map activeIdx to about/topology/hamshack
                            const hasNamed = !!(metadata?.aboutCard || metadata?.topologyCard || metadata?.hamshackCard)
                            if (hasNamed) {
                              const map = ['about','topology','hamshack']
                              const key = map[activeIdx] || 'about'
                              if (!confirm('Delete this card?')) return
                              const res = await fetch(`/api/admin/pages?id=${id}&card=${encodeURIComponent(key)}`, { method: 'DELETE' })
                              if (!res.ok) { alert('Delete failed'); return }
                              try { toast?.showToast && toast.showToast('Card deleted', 'success') } catch {}
                              // refresh load to reflect metadata change
                              await load()
                              return
                            }

                            // otherwise, delete the full page
                            if (!confirm('Delete this page?')) return
                            const res = await fetch(`/api/admin/pages?id=${id}`, { method: 'DELETE' })
                            if (res.ok) router.push('/admin/about')
                          } catch (e) {
                            // ignore
                          }
                        }}
                      />
                    </div>
                  </section>
                  <div style={{gridColumn: '1/-1'}}>
                    <div className={styles.stickyBar}>
                      <div style={{marginRight:'auto'}} className={styles.smallMuted}>
                        {saving ? (
                          'Saving…'
                        ) : (
                          <>
                            Changes saved automatically; press <span className={styles.kbd}>Ctrl/Cmd+S</span> to save now.
                          </>
                        )}
                      </div>
                      <div>
                        <button className={styles.btnGhost} type="submit">{saving ? 'Saving…' : 'Save'}</button>
                        <button className={styles.btnGhost} type="button" onClick={()=>setPreviewOpen(true)}>Preview</button>
                        <button className={styles.btnGhost} type="button" onClick={loadDraft}>Load Draft</button>
                        <button className={styles.btnDanger} type="button" onClick={discardDraft}>Discard Draft</button>
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
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{fontWeight:600}}>{slug ? `/aboutme` : 'About preview'}</div>
                  <div>
                    {slug ? <a className={styles.btnGhost} href={`/aboutme`} target="_blank" rel="noopener noreferrer">Open in new tab</a> : null}
                  </div>
                </div>
                <Card title={cards[activeIdx]?.title || 'About'} subtitle={cards[activeIdx]?.subtitle || ''}>
                  <div className={projectStyles.content} style={{gap:8}}>
                    <div className={projectStyles.media}>
                      {cards[activeIdx]?.image ? (
                        <div className={projectStyles.mainPhotoWrap} style={{maxWidth:320}}>
                          <img src={cards[activeIdx]?.image} alt={cards[activeIdx]?.title} className={projectStyles.mainPhoto} />
                        </div>
                      ) : null}
                    </div>
                    <div className={projectStyles.story}>
                      <div style={{color:'var(--white-95)'}} dangerouslySetInnerHTML={{ __html: purify ? purify.sanitize(String(metadata.summary?.text || '')) : (metadata.summary?.text || '') }} />
                      {cards[activeIdx]?.content ? <div style={{marginTop:8}} dangerouslySetInnerHTML={{ __html: purify ? purify.sanitize(String(cards[activeIdx]?.content).slice(0,400) + (String(cards[activeIdx]?.content).length > 400 ? '…' : '')) : (String(cards[activeIdx]?.content).slice(0,400) + (String(cards[activeIdx]?.content).length > 400 ? '…' : '')) }} /> : null}
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
