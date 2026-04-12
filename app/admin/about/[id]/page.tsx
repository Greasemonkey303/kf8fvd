"use client"

import React, { useCallback, useEffect, useEffectEvent, useMemo, useState, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import styles from '../../admin.module.css'
import projectStyles from '../../../projects/hotspot/hotspot.module.css'
import Card from '../../../../components/card/card'
import ProjectEditorSidebar from '../../../../components/admin/projects/ProjectEditorSidebar'
import RichTextEditor from '../../../../components/admin/RichTextEditor'
import AdminLoadingState from '@/components/admin/AdminLoadingState'
import AdminNotice from '@/components/admin/AdminNotice'
import AdminObjectImage from '@/components/admin/AdminObjectImage'
import Modal from '@/components/modal/Modal'
import { useToast } from '../../../../components/toast/ToastProvider'
import createDOMPurify from 'dompurify'
import { buildPublicUrl } from '../../../../lib/s3'
import { resolveManagedImageUrl } from '@/lib/siteMedia'

type CardData = { title?: string; subtitle?: string; content?: string; image?: string; images?: string[]; templateLarge?: string; templateSmall?: string }
type AboutMetadata = {
  summary?: { title?: string; text?: string; cta?: { label?: string; href?: string } }
  // legacy named cards supported for backward-compat; we prefer `cards` array
  aboutCard?: CardData
  topologyCard?: CardData
  hamshackCard?: CardData
  cards?: CardData[]
}

export default function AdminAboutEditor() {
  const routeParams = useParams()
  const routeIdParam = routeParams?.id ?? routeParams?.slug
  const idParam = Array.isArray(routeIdParam) ? routeIdParam[0] : routeIdParam
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [id, setId] = useState<number | null>(null)
  const [slug, setSlug] = useState<string>('')
  const [title, setTitle] = useState('About — KF8FVD')
  const [isPublished, setIsPublished] = useState(true)
  const [metadata, setMetadata] = useState<AboutMetadata>({})

  const [cards, setCards] = useState<CardData[]>([])
  const [cardStorageMode, setCardStorageMode] = useState<'cards' | 'named'>('cards')
  const [namedCardKeys, setNamedCardKeys] = useState<string[]>([])

  const searchParams = useSearchParams()
  const [activeIdx, setActiveIdx] = useState<number>(0)

  // single-card editor convenience state (gallery + form-like API used by ProjectEditorSidebar)
  const [images, setImages] = useState<string[]>([])
  const previewCloseRef = useRef<HTMLButtonElement | null>(null)
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null)
  const purify = typeof window !== 'undefined' ? createDOMPurify(window as unknown as Window & typeof globalThis) : null
  if (purify && typeof purify.setConfig === 'function') purify.setConfig({ FORBID_TAGS: ['script', 'style'] })

  const [uploadProgress, setUploadProgress] = useState<Record<string | number, number>>({})
  const [previewOpen, setPreviewOpen] = useState(false)
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const [deleteModal, setDeleteModal] = useState<Record<string, unknown> | null>({ open: false })
  const savingRef = useRef(false)
  const currentDraftKey = useMemo(() => `admin_about_draft:${slug || (id ? `about-${id}` : 'about')}`, [id, slug])
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    toast?.showToast?.(message, type)
  }, [toast])
  const clearDrafts = useCallback((...keys: string[]) => {
    for (const key of keys) {
      try { localStorage.removeItem(key) } catch {}
    }
  }, [])
  

  const draftKey = (idOrSlug?: string) => `admin_about_draft:${idOrSlug || slug || (id ? `about-${id}` : 'about')}`

  async function load() {
    setLoading(true)
    setError(null)
    try {
      if (!idParam) {
        setCards([])
        setError('About page route is missing an id.')
        return
      }
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
          let loadedCards: CardData[] = []
          let nextStorageMode: 'cards' | 'named' = 'cards'
          let nextNamedCardKeys: string[] = []
          if (Array.isArray(md.cards) && md.cards.length) {
            loadedCards = (md.cards as unknown[]).map((c: unknown) => {
              const card = c as Record<string, unknown>
              return {
                title: String(card['title'] ?? ''),
                subtitle: String(card['subtitle'] ?? ''),
                content: String(card['content'] ?? ''),
                image: resolveManagedImageUrl(card['image']),
                images: Array.isArray(card['images']) ? (card['images'] as string[]) : (card['image'] ? [String(card['image'])] : []),
                templateLarge: String(card['templateLarge'] ?? ''),
                templateSmall: String(card['templateSmall'] ?? ''),
              } as CardData
            })
          } else {
            const namedEntries = [
              { key: 'about', card: md.aboutCard, fallbackTitle: String(found.title || 'About Me'), fallbackSubtitle: '', fallbackContent: String(found.content || '') },
              { key: 'topology', card: md.topologyCard, fallbackTitle: 'Home Topology', fallbackSubtitle: 'Hidden Lakes Apartments, Kentwood', fallbackContent: '' },
              { key: 'hamshack', card: md.hamshackCard, fallbackTitle: 'Ham Shack', fallbackSubtitle: 'Home Radio & Workshop', fallbackContent: '' },
            ].filter((entry) => entry.card && typeof entry.card === 'object') as Array<{ key: string; card: Record<string, unknown>; fallbackTitle: string; fallbackSubtitle: string; fallbackContent: string }>

            if (namedEntries.length > 0) {
              nextStorageMode = 'named'
              nextNamedCardKeys = namedEntries.map((entry) => entry.key)
              loadedCards = namedEntries.map((entry) => ({
                title: String(entry.card.title ?? entry.fallbackTitle),
                subtitle: String(entry.card.subtitle ?? entry.fallbackSubtitle),
                content: String(entry.card.content ?? entry.fallbackContent),
                image: resolveManagedImageUrl(entry.card.image),
                images: entry.card.image ? [resolveManagedImageUrl(entry.card.image)] : [],
                templateLarge: String(entry.card.templateLarge ?? ''),
                templateSmall: String(entry.card.templateSmall ?? ''),
              }))
            }
          }
          // determine which card index to open (from search param `card`)
          let requestedIndex = 0
          try {
            const cp = searchParams?.get('card')
            if (cp !== null && cp !== undefined) {
              const namedIndex = nextNamedCardKeys.indexOf(String(cp))
              if (namedIndex >= 0) requestedIndex = namedIndex
              else {
                const parsed = parseInt(String(cp), 10)
                if (!Number.isNaN(parsed)) requestedIndex = parsed
              }
            }
          } catch {}
          if (requestedIndex < 0) requestedIndex = 0
          if (requestedIndex >= loadedCards.length) requestedIndex = Math.max(0, loadedCards.length - 1)
          setCardStorageMode(nextStorageMode)
          setNamedCardKeys(nextNamedCardKeys)
          setCards(loadedCards)
          setActiveIdx(requestedIndex)
          // populate gallery images from the active card's images (prefer card-local gallery), fall back to metadata.images or the card's image
          const activeCard = loadedCards[requestedIndex] || ({} as CardData)
          const cardImgs: string[] = (Array.isArray(activeCard.images) && activeCard.images.length) ? activeCard.images : (Array.isArray(md.images) ? md.images : (activeCard.image ? [activeCard.image] : []))
          setImages(cardImgs.slice(0,6))
          setMetadata(md as AboutMetadata)
        } catch {}
      } else {
        setCards([])
        setError(`About page ${String(idParam)} was not found.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load about editor')
    } finally { setLoading(false) }
  }

  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(()=>{ const t = setTimeout(() => { void loadRef.current() }, 0); return ()=>clearTimeout(t) }, [idParam])

  // autosave locally (debounced)
  const autosaveTimer = useRef<number | null>(null)
  useEffect(()=>{
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
    autosaveTimer.current = window.setTimeout(()=>{
      try {
        const payload = { slug, title, metadata, cards, cardStorageMode, namedCardKeys, id, updated: Date.now() }
        localStorage.setItem(currentDraftKey, JSON.stringify(payload))
        // autosave: store locally but avoid noisy toasts on every autosave
      } catch {}
    }, 800)
    return ()=>{ if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current) }
  }, [cardStorageMode, cards, currentDraftKey, id, metadata, namedCardKeys, slug, title])

  // restore any draft available (try slug/id-specific, then generic)
  useEffect(()=>{
    try {
      const keysToTry = [currentDraftKey, 'admin_about_draft:about', `admin_about_draft:about-${id}`]
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
            if (Array.isArray(p.cards)) setCards(p.cards)
            if (p.cardStorageMode === 'named' || p.cardStorageMode === 'cards') setCardStorageMode(p.cardStorageMode)
            if (Array.isArray(p.namedCardKeys)) setNamedCardKeys(p.namedCardKeys.map((key: unknown) => String(key)))
            showToast('Restored unsaved draft', 'info')
            break
          }
        } catch {}
      }
    } catch {}
  }, [currentDraftKey, id, showToast, title])

  const loadDraft = ()=>{
    try {
      const key = draftKey()
      const raw = localStorage.getItem(key) || localStorage.getItem('admin_about_draft:about')
      if (!raw) return
      const p = JSON.parse(raw)
      if (p) {
        setTitle(p.title || title)
        if (p.id) setId(p.id)
        if (p.slug) setSlug(p.slug)
        if (p.metadata) setMetadata(p.metadata)
        if (Array.isArray(p.cards)) setCards(p.cards)
        if (p.cardStorageMode === 'named' || p.cardStorageMode === 'cards') setCardStorageMode(p.cardStorageMode)
        if (Array.isArray(p.namedCardKeys)) setNamedCardKeys(p.namedCardKeys.map((key: unknown) => String(key)))
      }
    } catch {}
  }

  const discardDraft = ()=>{
    clearDrafts(currentDraftKey, 'admin_about_draft:about')
    void load()
    showToast('Draft discarded', 'info')
  }

  const updateMetadata = (path: string[], value: unknown) => {
    setMetadata((prev)=>{
      const next = JSON.parse(JSON.stringify(prev || {})) as Record<string, unknown>
      let cur: Record<string, unknown> = next
      for (let i=0;i<path.length-1;i++){ const k = path[i]; if (!cur[k as string]) (cur as Record<string, unknown>)[k as string] = {}; cur = (cur[k as string] as Record<string, unknown>) }
      (cur as Record<string, unknown>)[path[path.length-1]] = value
      return next as AboutMetadata
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
        showToast('Card deleted', 'success')
      } else if (deleteModal.mode === 'named') {
        const key = String((deleteModal as Record<string, unknown>)?.namedKey || '')
        const res = await fetch(`/admin/api/pages?id=${id}&card=${encodeURIComponent(key)}`, { method: 'DELETE' })
        if (!res.ok) { alert('Delete failed'); return }
        showToast('Card deleted', 'success')
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
    } catch {
      // ignore
    } finally {
      setDeleteModal({ open: false })
    }
  }

  // keep images state in sync with the active card's gallery
  useEffect(()=>{
    setImages(prev => {
      const imgs = Array.isArray(cards[activeIdx]?.images) && cards[activeIdx]?.images.length ? (cards[activeIdx]?.images as string[]).slice(0,6) : (cards[activeIdx]?.image ? [cards[activeIdx].image] : [])
      const a = JSON.stringify(prev || [])
      const b = JSON.stringify(imgs)
      return a !== b ? imgs : prev
    })
  }, [activeIdx, cards])

  const handleSaveShortcut = useEffectEvent(() => {
    void handleSave()
  })

  // Ctrl/Cmd+S save
  useEffect(()=>{
    const handler = (ev: KeyboardEvent)=>{ if ((ev.ctrlKey||ev.metaKey) && ev.key.toLowerCase()==='s') { ev.preventDefault(); handleSaveShortcut() } }
    window.addEventListener('keydown', handler)
    return ()=>window.removeEventListener('keydown', handler)
  }, [])

  const getErrMsg = (err: unknown) => { if (err instanceof Error) return err.message; try { return String(err) } catch { return 'Unknown error' } }
  async function handleSave() {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError(null)
    try{
      const normalizedCards = cards.map((card) => ({
        title: String(card.title ?? ''),
        subtitle: String(card.subtitle ?? ''),
        content: String(card.content ?? ''),
        image: String(card.image ?? ''),
        images: Array.isArray(card.images) ? card.images.filter(Boolean).map((image) => String(image)) : [],
        templateLarge: String(card.templateLarge ?? ''),
        templateSmall: String(card.templateSmall ?? ''),
      }))
      const safeMetadata: Record<string, unknown> = { ...metadata }
      delete safeMetadata.cards
      delete safeMetadata.aboutCard
      delete safeMetadata.topologyCard
      delete safeMetadata.hamshackCard
      if (cardStorageMode === 'named' && namedCardKeys.length > 0) {
        namedCardKeys.forEach((key, index) => {
          const card = normalizedCards[index]
          if (!card) return
          safeMetadata[`${key}Card`] = card
        })
      } else {
        safeMetadata.cards = normalizedCards
      }
      const payload: Record<string, unknown> = { id, slug: slug || undefined, title, content: '', metadata: safeMetadata, is_published: isPublished ? 1 : 0 }
      const method = id ? 'PUT' : 'POST'
      const res = await fetch('/admin/api/pages', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) {
        const err = await res.json().catch(()=>({}))
        const detailText = Array.isArray(err?.details)
          ? err.details
              .map((detail: { field?: unknown; message?: unknown }) => {
                const field = typeof detail?.field === 'string' ? detail.field : ''
                const message = typeof detail?.message === 'string' ? detail.message : ''
                if (field && message && message !== field) return `${field}: ${message}`
                return message || field
              })
              .filter(Boolean)
              .join('; ')
          : ''
        const message = detailText ? `Save failed: ${detailText}` : `Save failed: ${err?.error || res.status}`
        setError(message)
        showToast(message, 'error')
        return
      }
      const json = await res.json()
      if (!id && json?.id) setId(json.id)
      clearDrafts(currentDraftKey, 'admin_about_draft:about')
      showToast('Saved', 'success')
    }catch(error){
      const message = 'Save failed: ' + getErrMsg(error)
      setError(message)
      showToast(message, 'error')
    } finally { setSaving(false); savingRef.current = false }
  }

  // upload card image for a specific card index (tries direct server upload then presign PUT, falls back)
  async function uploadCardImageIndex(file: File, idx: number){
    if (!file) return
    const MAX_BYTES = 50 * 1024 * 1024
    setError(null)
    if (file.size > MAX_BYTES) {
      setError('File too large. The maximum supported size is 50MB.')
      return
    }
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
        setUploadProgress(p=>({ ...p, [idx]: 0 })); showToast('Image uploaded', 'success'); return
      }
    } catch (err) { console.error('direct upload error', getErrMsg(err)) }

    // presign
    try{
      const res = await fetch('/api/uploads', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ slug:String(slug||'about'), filename: file.name, contentType: file.type }) })
      const data = await res.json()
      if (!data.url) {
        setError('Upload presign failed: ' + (data.error || 'unknown'))
        setUploadProgress(p=>({ ...p, [idx]: 0 }))
        return
      }

      // PUT to presigned URL
      const upload = await fetch(data.url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!upload.ok) {
        // fallback to server direct
        const fd2 = new FormData(); fd2.append('file', file); fd2.append('slug',String(slug||'about')); fd2.append('filename', file.name)
        try { const direct2 = await fetch('/api/uploads/direct', { method:'POST', body: fd2 }); const j = await direct2.json(); if (direct2.ok && (j.publicUrl || j.key)) { const jurl = j.key ? buildPublicUrl(j.key) : (j.publicUrl || j.key); updateCard(idx, 'image', jurl); setUploadProgress(p=>({ ...p, [idx]: 0 })); showToast('Image uploaded', 'success'); return } } catch(error){ console.error('direct fallback error', getErrMsg(error)) }
        setError('Upload failed after both direct and presigned attempts.')
        setUploadProgress(p=>({ ...p, [idx]: 0 })); return
      }

      try {
        if (data.key) await fetch('/api/uploads/finalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: data.key }) })
      } catch (error) { console.error('upload finalize error', getErrMsg(error)) }

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
      showToast('Image uploaded', 'success')
    } catch (err) {
      console.error('upload error', getErrMsg(err))
      setUploadProgress(p=>({ ...p, [idx]: 0 }))
      setError('Upload failed: ' + getErrMsg(err))
    }
  }

  if (loading) return <AdminLoadingState label="Loading about editor" />

  // Precompute sanitized HTML snippets to avoid complex inline expressions in JSX
  const sanitizedSummaryHtml = ( (metadata.summary as Record<string, unknown>)?.['text_sanitized'] ?? (purify ? purify.sanitize(String(metadata.summary?.text || '')) : (metadata.summary?.text || '')) ) as string
  const rawCardContent = ( ((cards[activeIdx] as Record<string, unknown>)?.['content_sanitized']) ?? (purify ? purify.sanitize(String(cards[activeIdx]?.content || '')) : String(cards[activeIdx]?.content || '')) ) as string
  const previewCardHtml = (typeof rawCardContent === 'string' && rawCardContent.slice)
    ? rawCardContent.slice(0, 400) + (String(cards[activeIdx]?.content || '').length > 400 ? '…' : '')
    : (String(cards[activeIdx]?.content || '').slice(0, 400) + (String(cards[activeIdx]?.content || '').length > 400 ? '…' : ''))

  return (
    <div>
      {error ? <AdminNotice message={error} variant="error" actionLabel={loading ? undefined : 'Retry'} onAction={loading ? undefined : load} /> : null}
      <div className={`${styles.topTitle} ${styles.mb12}`}>Edit About — ID: {id ?? String(idParam)} <span className={`${styles.kbd} ${styles.inlineGapLeft8}`}>Ctrl/Cmd+S</span></div>
      <div className={styles.mb12}>
        <button className={styles.btnGhost} onClick={load}>Refresh</button>
      </div>

      
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

                  <section className={styles.mt6}>
                    <h3>Summary</h3>
                    <label>
                      <div className="field-label">Heading</div>
                      <input value={metadata.summary?.title || ''} onChange={e=>updateMetadata(['summary','title'], e.target.value)} className={styles.formInput} />
                    </label>
                    <label>
                      <div className="field-label">Text</div>
                      <div className={`${styles.smallMuted} ${styles.richTextHint}`}>This is the summary text shown on the About page.</div>
                      <RichTextEditor
                        value={String(metadata.summary?.text || '')}
                        onChange={(value) => updateMetadata(['summary','text'], value)}
                        placeholder="Write the About summary…"
                        minHeight={360}
                        expandedMinHeight={560}
                      />
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

                  <section className={styles.sectionPanel}>
                    <h3>About Card</h3>
                    <div className={styles.previewContentRow}>
                      <div className={styles.previewCopy}>
                        {cards[activeIdx] ? (
                          <div className={styles.descEditorBox}>
                            <div className={styles.rowBetween12}>
                              <div className={styles.titleStrong}>{cards[activeIdx].title || 'About Card'}</div>
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
                              <RichTextEditor
                                value={String(cards[activeIdx]?.content || '')}
                                onChange={(value) => updateCard(activeIdx,'content', value)}
                                placeholder="Write this card's content…"
                                minHeight={320}
                                expandedMinHeight={620}
                              />
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
                          const hasCardsArray = cardStorageMode === 'cards' && cards.length > 0
                          const hasNamed = cardStorageMode === 'named' && namedCardKeys.length > 0
                          if (hasCardsArray && cards.length > 1) {
                            setDeleteModal({ open: true, mode: 'card', idx: activeIdx, message: 'Delete this card?' })
                            return
                          }
                          if (hasNamed) {
                            const key = namedCardKeys[activeIdx] || 'about'
                            setDeleteModal({ open: true, mode: 'named', namedKey: key, message: 'Delete this card?' })
                            return
                          }
                          setDeleteModal({ open: true, mode: 'page', message: 'Delete this page?' })
                        }}
                      />
                    </div>
                  </section>
                  <div className={styles.fullSpan}>
                    <div className={styles.stickyBar}>
                      <div className={`${styles.smallMuted} ${styles.topBarInfo}`}>
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
      {previewOpen && (
        <Modal overlayClassName={styles.modalOverlay} contentClassName={styles.modalContent} onClose={()=>setPreviewOpen(false)} initialFocusRef={previewCloseRef as React.RefObject<HTMLElement>} titleId="preview-title">
          <div className={`${styles.rowBetween12} ${styles.mb12}`}>
            <div className={styles.titleStrong}>Preview</div>
            <button ref={previewCloseRef} className={styles.btnGhost} onClick={()=>setPreviewOpen(false)}>Close</button>
          </div>
          <div className={styles.previewDialogWide}>
            <div className={styles.stack12}>
              <div className={styles.rowBetween12}>
                <div className={styles.titleStrong}>{slug ? `/aboutme` : 'About preview'}</div>
                <div>
                  {slug ? <a className={styles.btnGhost} href={`/aboutme`} target="_blank" rel="noopener noreferrer">Open in new tab</a> : null}
                </div>
              </div>
              <Card title={cards[activeIdx]?.title || 'About'} subtitle={cards[activeIdx]?.subtitle || ''}>
                <div className={`${projectStyles.content} ${styles.projectStoryGap}`}>
                    <div className={projectStyles.media}>
                      {cards[activeIdx]?.image ? (
                        <div className={`${projectStyles.mainPhotoWrap} ${styles.maxWidth320}`}>
                          <AdminObjectImage src={String(cards[activeIdx]?.image || '')} alt={cards[activeIdx]?.title || 'About image'} width={320} height={200} imageClassName={projectStyles.mainPhoto} fallbackLabel="No image" />
                        </div>
                      ) : null}
                    </div>
                      <div className={projectStyles.story}>
                      <div className={styles.whiteText} dangerouslySetInnerHTML={{ __html: sanitizedSummaryHtml }} />
                      {cards[activeIdx]?.content ? <div className={styles.storyTopGap} dangerouslySetInnerHTML={{ __html: previewCardHtml }} /> : null}
                    </div>
                </div>
              </Card>
            </div>
          </div>
        </Modal>
      )}
      {deleteModal && deleteModal.open ? (
        <Modal overlayClassName={styles.modalOverlay} contentClassName={styles.modalContent} onClose={() => setDeleteModal({ open: false })} initialFocusRef={deleteCancelRef as React.RefObject<HTMLElement>} titleId="confirm-delete-title" descriptionId="confirm-delete-desc">
          <div className={`${styles.rowBetween12} ${styles.mb12}`}>
            <div className={styles.titleStrong}>Confirm Delete</div>
            <button className={styles.btnGhost} onClick={()=>setDeleteModal({ open: false })}>Close</button>
          </div>
          <div className={styles.mb12}>{String((deleteModal as Record<string, unknown>)?.message || 'Are you sure?')}</div>
          <div className={styles.rowEnd8}>
            <button ref={deleteCancelRef} className={styles.btnGhost} onClick={()=>setDeleteModal({ open: false })}>Cancel</button>
            <button className={styles.btnDanger} onClick={confirmDelete}>Delete</button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
