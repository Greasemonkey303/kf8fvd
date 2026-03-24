"use client"

import React, { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import styles from '../../admin.module.css'
import projectStyles from '../../../projects/hotspot/hotspot.module.css'
import Card from '../../../../components/card/card'
import ProjectEditorSidebar from '../../../../components/admin/projects/ProjectEditorSidebar'
import Modal from '@/components/modal/Modal'
import { useToast } from '../../../../components/toast/ToastProvider'
import Image from 'next/image'
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

export default function AdminAboutEditor({ params }: { params?: unknown }) {
  // `params` may be a Promise in the App Router — treat as unknown and access via indexer
  const resolvedParams = params as Record<string, unknown> | undefined
  const idParam = resolvedParams ? (resolvedParams['id'] ?? resolvedParams['slug']) : undefined
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
  const [editorExpanded, setEditorExpanded] = useState(false)
  const descRef = useRef<HTMLDivElement | null>(null)
  const [descExpanded, setDescExpanded] = useState(false)
  const previewCloseRef = useRef<HTMLButtonElement | null>(null)
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null)
  const purify = typeof window !== 'undefined' ? createDOMPurify(window as unknown as Window & typeof globalThis) : null
  if (purify && typeof purify.setConfig === 'function') purify.setConfig({ FORBID_TAGS: ['script', 'style'] })

  const [uploadProgress, setUploadProgress] = useState<Record<string | number, number>>({})
  const [previewOpen, setPreviewOpen] = useState(false)
  const toast = useToast()
  const [deleteModal, setDeleteModal] = useState<Record<string, unknown> | null>({ open: false })
  const savingRef = useRef(false)
  

  const draftKey = (idOrSlug?: string) => `admin_about_draft:${idOrSlug || slug || (id ? `about-${id}` : 'about')}`

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/admin/api/pages?page=1&limit=1000')
      const json = await res.json()
      const items = (json?.items || []) as Array<Record<string, unknown>>
      const found = items.find(i => String(i['id']) === String(idParam) || String(i['slug']) === String(idParam))
      if (found) {
        setId(Number(found['id']) || null)
        setSlug(String(found['slug'] || ''))
        setTitle(String(found['title'] || ''))
        setIsPublished(Boolean(found['is_published']))
        try {
          const md = found.metadata ? (typeof found.metadata === 'string' ? JSON.parse(found.metadata) : found.metadata) : {}
          // If cards array exists, prefer it. Otherwise convert legacy named cards to a cards array so editor works consistently.
          let loadedCards: CardData[] = []
          if (Array.isArray(md.cards) && md.cards.length) {
            loadedCards = (md.cards as unknown[]).map((c: unknown) => {
              const card = c as Record<string, unknown>
              return {
                title: String(card['title'] ?? ''),
                subtitle: String(card['subtitle'] ?? ''),
                content: String(card['content'] ?? ''),
                image: String(card['image'] ?? '/headshot.jpg'),
                images: Array.isArray(card['images']) ? (card['images'] as string[]) : (card['image'] ? [String(card['image'])] : []),
                templateLarge: String(card['templateLarge'] ?? ''),
                templateSmall: String(card['templateSmall'] ?? ''),
              } as CardData
            })
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
                const parsed = parseInt(String(cp), 10)
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
        // autosave: store locally but avoid noisy toasts on every autosave
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

  const updateMetadata = (path: string[], value: unknown) => {
    setMetadata((prev)=>{
      const next = JSON.parse(JSON.stringify(prev || {})) as Record<string, unknown>
      let cur: Record<string, unknown> = next
      for (let i=0;i<path.length-1;i++){ const k = path[i]; if (!cur[k as string]) (cur as Record<string, unknown>)[k as string] = {}; cur = (cur[k as string] as Record<string, unknown>) }
      (cur as Record<string, unknown>)[path[path.length-1]] = value
      return next as AboutMetadata
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
  const updateCard = (idx: number, key: keyof CardData, value: unknown) => {
    setCards(old => {
      const copy = old.slice()
      if (idx < 0 || idx >= copy.length) return old
      const base = copy[idx] || {}
      copy[idx] = { ...base, ...(base as Partial<CardData>), [key]: value } as CardData
      return copy
    })
  }

  // Project-like sidebar helpers (operate on the first/about card)
  const setFormLike = (val: unknown) => {
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
    let next: Record<string, unknown>
    if (typeof val === 'function') {
      next = (val as (c: typeof current) => Record<string, unknown>)(current)
    } else {
      next = { ...current, ...(val as Record<string, unknown>) }
    }
    if (next.slug !== undefined) setSlug(String(next.slug ?? ''))
    if (next.title !== undefined) setTitle(String(next.title ?? ''))
    if (next.image_path !== undefined) updateCard(idx, 'image', next.image_path)
    if (next.image_path !== undefined) {
      // ensure card gallery includes this image and main image is set
      setCards(prev => {
        const copy = prev.slice()
        const card = copy[idx] || { title:'', subtitle:'', content:'', image: String(next.image_path || ''), images: [] as string[] }
        const imgs = Array.isArray(card.images) ? card.images.slice() : []
        const imgPath = String(next.image_path ?? '')
        if (imgPath && !imgs.includes(imgPath)) imgs.push(imgPath)
        card.images = imgs
        card.image = imgPath
        copy[idx] = card
        return copy
      })
      setImages(prev => { const nextImgs = prev.slice(); const imgPath = String(next.image_path ?? ''); if (imgPath && !nextImgs.includes(imgPath)) nextImgs.push(imgPath); return nextImgs })
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
    // show modal confirmation instead of browser confirm
    setDeleteModal({ open: true, mode: 'image', message: 'Delete the main image from storage and clear Image path?', imageUrl: src, imageIdx: undefined })
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
    // use modal confirmation instead of browser confirm
    setDeleteModal({ open: true, mode: 'image', message: 'Delete this image from storage and remove from gallery?', imageUrl: src, imageIdx: idx })
  }

  const confirmDelete = async () => {
    if (!deleteModal || !deleteModal.open) return
    try {
      if (deleteModal.mode === 'card') {
        const idx = Number((deleteModal as Record<string, unknown>)?.idx ?? -1)
        if (idx < 0) { setDeleteModal({ open: false }); return }
        const res = await fetch(`/admin/api/pages?id=${id}&card=${idx}`, { method: 'DELETE' })
        if (!res.ok) { alert('Delete failed'); return }
        setCards(prev => {
          const copy = prev.slice()
          copy.splice(idx, 1)
          return copy
        })
        setActiveIdx(i => Math.max(0, Math.min(i, Math.max(0, cards.length - 2))))
        // sync images for new active card
        setImages(() => {
          const nextCards = cards.slice(); nextCards.splice(idx, 1)
          const newCard = nextCards[Math.max(0, Math.min(idx, Math.max(0, nextCards.length - 1)))]
          if (!newCard) return []
          return (Array.isArray(newCard.images) && newCard.images.length) ? (newCard.images as string[]).slice(0,6) : (newCard.image ? [newCard.image] : [])
        })
        try { toast?.showToast && toast.showToast('Card deleted', 'success') } catch {}
      } else if (deleteModal.mode === 'named') {
        const key = String((deleteModal as Record<string, unknown>)?.namedKey || '')
        const res = await fetch(`/admin/api/pages?id=${id}&card=${encodeURIComponent(key)}`, { method: 'DELETE' })
        if (!res.ok) { alert('Delete failed'); return }
        try { toast?.showToast && toast.showToast('Card deleted', 'success') } catch {}
        await load()
      } else if (deleteModal.mode === 'page') {
        const res = await fetch(`/admin/api/pages?id=${id}`, { method: 'DELETE' })
        if (res.ok) router.push('/admin/about')
      } else if (deleteModal.mode === 'image') {
        const url = deleteModal.imageUrl
        const idx = deleteModal.imageIdx
        try { await fetch('/api/uploads/delete', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ url }) }) } catch {}
        setCards(prev => {
          const copy = prev.slice()
          const card = copy[activeIdx] || { images: [] as string[] }
          const imgs = Array.isArray(card.images) ? card.images.slice() : images.slice()
          const next = imgs.filter((_,i)=>i!==idx)
          card.images = next
          if (card.image === url) card.image = ''
          copy[activeIdx] = card
          return copy
        })
        setImages(prev => prev.filter((_,i)=>i!==idx))
      }
    } catch (e) {
      // ignore
    } finally {
      setDeleteModal({ open: false })
    }
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
      const el = cardRefs.current[activeIdx]
      if (el && document.activeElement !== el) {
        const desired = cards[activeIdx]?.content || ''
        if ((el.innerHTML || '') !== desired) el.innerHTML = desired
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
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try{
      const safeMetadata = { ...metadata, cards }
      const payload: Record<string, unknown> = { id, slug: slug || undefined, title, content: '', metadata: safeMetadata, is_published: isPublished ? 1 : 0 }
      const method = id ? 'PUT' : 'POST'
      const res = await fetch('/admin/api/pages', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const err = await res.json().catch(()=>({})); alert('Save failed: ' + (err?.error || res.status)); return }
      const json = await res.json()
      if (!id && json?.id) setId(json.id)
      try { localStorage.removeItem(draftKey()); localStorage.removeItem('admin_about_draft:about') } catch{}
      try { toast?.showToast && toast.showToast('Saved', 'success') } catch{}
    }catch(e){ alert('Save failed: ' + getErrMsg(e)) } finally { setSaving(false); savingRef.current = false }
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

  // Precompute sanitized HTML snippets to avoid complex inline expressions in JSX
  const sanitizedSummaryHtml = ( (metadata.summary as Record<string, unknown>)?.['text_sanitized'] ?? (purify ? purify.sanitize(String(metadata.summary?.text || '')) : (metadata.summary?.text || '')) ) as string
  const rawCardContent = ( ((cards[activeIdx] as Record<string, unknown>)?.['content_sanitized']) ?? (purify ? purify.sanitize(String(cards[activeIdx]?.content || '')) : String(cards[activeIdx]?.content || '')) ) as string
  const previewCardHtml = (typeof rawCardContent === 'string' && rawCardContent.slice)
    ? rawCardContent.slice(0, 400) + (String(cards[activeIdx]?.content || '').length > 400 ? '…' : '')
    : (String(cards[activeIdx]?.content || '').slice(0, 400) + (String(cards[activeIdx]?.content || '').length > 400 ? '…' : ''))

  return (
    <div>
      <div style={{marginBottom:12}} className={styles.topTitle}>Edit About — ID: {id ?? String(idParam)} <span style={{marginLeft:8}} className={styles.kbd}>Ctrl/Cmd+S</span></div>
      <div style={{marginBottom:12}}>
        <button className={styles.btnGhost} onClick={load}>Refresh</button>
      </div>

      
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
                        <div id="about-summary-editor" ref={descRef} contentEditable suppressContentEditableWarning className={styles.formTextarea} onInput={(e)=>{ updateMetadata(['summary','text'], (e.currentTarget as HTMLDivElement).innerHTML || '') }} style={{minHeight: descExpanded ? 520 : 360, maxHeight:900, overflow:'auto', resize:'vertical'}} />
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
                                <div ref={(el)=>{ cardRefs.current[activeIdx] = el }} id="about-card-editor" contentEditable suppressContentEditableWarning className={styles.formTextarea} onInput={(e)=>{ updateCard(activeIdx,'content', (e.currentTarget as HTMLDivElement).innerHTML || '') }} style={{minHeight: editorExpanded ? 600 : 320, maxHeight:1200, overflow:'auto', resize:'vertical'}} />
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
                        onRemove={() => {
                          if (!id) return
                          const hasCardsArray = Array.isArray(metadata?.cards) && metadata?.cards.length > 0
                          const hasNamed = !!(metadata?.aboutCard || metadata?.topologyCard || metadata?.hamshackCard)
                          if (hasCardsArray && cards.length > 1) {
                            setDeleteModal({ open: true, mode: 'card', idx: activeIdx, message: 'Delete this card?' })
                            return
                          }
                          if (hasNamed) {
                            const map = ['about','topology','hamshack']
                            const key = map[activeIdx] || 'about'
                            setDeleteModal({ open: true, mode: 'named', namedKey: key, message: 'Delete this card?' })
                            return
                          }
                          setDeleteModal({ open: true, mode: 'page', message: 'Delete this page?' })
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
        <Modal overlayClassName={styles.modalOverlay} contentClassName={styles.modalContent} onClose={()=>setPreviewOpen(false)} initialFocusRef={previewCloseRef as React.RefObject<HTMLElement>} titleId="preview-title">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
            <div style={{fontWeight:700}}>Preview</div>
            <button ref={previewCloseRef} className={styles.btnGhost} onClick={()=>setPreviewOpen(false)}>Close</button>
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
                        <div className={projectStyles.mainPhotoWrap} style={{ maxWidth: 320 }}>
                          <Image src={String(cards[activeIdx]?.image)} alt={cards[activeIdx]?.title || ''} width={320} height={200} className={projectStyles.mainPhoto} style={{ objectFit: 'cover' }} unoptimized />
                        </div>
                      ) : null}
                    </div>
                      <div className={projectStyles.story}>
                      <div style={{ color: 'var(--white-95)' }} dangerouslySetInnerHTML={{ __html: sanitizedSummaryHtml }} />
                      {cards[activeIdx]?.content ? <div style={{ marginTop: 8 }} dangerouslySetInnerHTML={{ __html: previewCardHtml }} /> : null}
                    </div>
                </div>
              </Card>
            </div>
          </div>
        </Modal>
      )}
      {deleteModal && deleteModal.open ? (
        <Modal overlayClassName={styles.modalOverlay} contentClassName={styles.modalContent} onClose={() => setDeleteModal({ open: false })} initialFocusRef={deleteCancelRef as React.RefObject<HTMLElement>} titleId="confirm-delete-title" descriptionId="confirm-delete-desc">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
            <div style={{fontWeight:700}}>Confirm Delete</div>
            <button className={styles.btnGhost} onClick={()=>setDeleteModal({ open: false })}>Close</button>
          </div>
          <div style={{marginBottom:12}}>{String((deleteModal as Record<string, unknown>)?.message || 'Are you sure?')}</div>
          <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
            <button ref={deleteCancelRef} className={styles.btnGhost} onClick={()=>setDeleteModal({ open: false })}>Cancel</button>
            <button className={styles.btnDanger} onClick={confirmDelete}>Delete</button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
