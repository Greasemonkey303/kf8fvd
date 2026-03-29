"use client"

import React, { useEffect, useState, useRef } from 'react'
import styles from '../admin.module.css'
import Card from '../../../components/card/card'
import AdminNotice from '@/components/admin/AdminNotice'
import AdminObjectImage from '@/components/admin/AdminObjectImage'
import { useToast } from '../../../components/toast/ToastProvider'
import RichTextEditor from '../../../components/admin/RichTextEditor'
import createDOMPurify from 'dompurify'

type CredItem = { id?: number | null; section: string; slug: string; s3_prefix?: string; title: string; tag?: string; authority?: string; image_path?: string | null; description?: string | null; is_published?: number; sort_order?: number }
type Section = { id?: number | null; name?: string; slug?: string; subtitle?: string; image_path?: string | null; sort_order?: number }
type LocalDraft = { key: string; payload: { form?: Partial<CredItem>; updated?: number } } | null
type DeletedUndo = { items: CredItem[]; ts: number } | null

const EMPTY_FORM: CredItem = { id: null, section: '', slug: '', title: '', tag: '', authority: '', image_path: '', description: '', is_published: 1, sort_order: 0 }
const EMPTY_SECTION_FORM: Section = { id: null, name: '', slug: '', subtitle: '', image_path: '', sort_order: 0 }

export default function AdminCredentials() {
  const [items, setItems] = useState<CredItem[]>([])
  const [form, setForm] = useState<CredItem>(EMPTY_FORM)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [uploadCompleted, setUploadCompleted] = useState<boolean>(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const toast = useToast()
  const autosaveTimer = React.useRef<number | null>(null)
  const draftId = React.useId()
  const [pendingDraftTemp, setPendingDraftTemp] = useState<LocalDraft>(null)
  const [pendingDraftSlug, setPendingDraftSlug] = useState<LocalDraft>(null)
  const [selectedIds, setSelectedIds] = useState<(string|number)[]>([])
  const [deletedUndoBuffer, setDeletedUndoBuffer] = useState<DeletedUndo>(null)
  const [needOrderSave, setNeedOrderSave] = useState(false)
  const [sections, setSections] = useState<Section[]>([])
  const [sectionsLoading, setSectionsLoading] = useState(true)
  const [showSectionsPanel, setShowSectionsPanel] = useState(false)
  const [sectionForm, setSectionForm] = useState<Section>(EMPTY_SECTION_FORM)
  const [error, setError] = useState<string | null>(null)
  const [slugEdited, setSlugEdited] = useState(false)
  const [sectionSlugEdited, setSectionSlugEdited] = useState(false)
  const [mounted, setMounted] = useState(false)
  const currentDraftKey = React.useMemo(() => `admin_credential_draft:${form.slug || draftId}`, [draftId, form.slug])
  const showToast = React.useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    toast?.showToast?.(message, type)
  }, [toast])
  const clearDraft = React.useCallback(() => {
    try { localStorage.removeItem(currentDraftKey) } catch {}
  }, [currentDraftKey])
  const resetForm = React.useCallback(() => {
    setForm(EMPTY_FORM)
    setSlugEdited(false)
  }, [])

  const load = React.useCallback(async () => {
    const res = await fetch('/admin/api/credentials')
    const data = await res.json()
    setItems(data.items || [])
    try { console.debug('[admin/credentials] load items', (data.items || []).map((i: Partial<CredItem>)=>({ id: i.id, sort_order: i.sort_order, section: i.section }))) } catch {}
  }, [])

  const loadSections = React.useCallback(async () => {
    setSectionsLoading(true)
    try {
      const res = await fetch('/admin/api/credential-sections')
      const data = await res.json()
      setSections(data.items || [])
    } catch (err) { console.error('loadSections err', err) }
    setSectionsLoading(false)
  }, [])

  useEffect(() => { const t = setTimeout(() => { void load(); void loadSections() }, 0); return () => clearTimeout(t) }, [load, loadSections])

  const submit = React.useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError(null)
    if (!form.slug || !form.title || !form.section) {
      setError('Section, slug, and title are required before saving a credential.')
      return
    }
    try {
      const isUpdate = !!form.id
      const response = await fetch('/admin/api/credentials', { method: isUpdate ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'Credential save failed')
      // clear any saved draft for this slug
      clearDraft()
      resetForm()
      await load()
      showToast(isUpdate ? 'Credential updated' : 'Credential created', 'success')
    } catch (err) {
      console.error('create error', err)
      const message = err instanceof Error ? err.message : 'Credential save failed'
      setError(message)
      showToast(message, 'error')
    }
  }, [clearDraft, form, load, resetForm, showToast])

  // Ctrl/Cmd+S handler for save
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault()
        void submit()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [submit])

  // Debounced autosave to localStorage (modeled after Projects admin)
  useEffect(() => {
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
    autosaveTimer.current = window.setTimeout(() => {
      try {
        const payload = { form, updated: Date.now() }
        try { localStorage.setItem(currentDraftKey, JSON.stringify(payload)) } catch {}
      } catch {}
    }, 800)
    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current) }
  }, [currentDraftKey, form, showToast])

  // On mount, check for a temp draft but do not auto-apply — show a prompt
  useEffect(()=>{
    try {
      const key = `admin_credential_draft:${draftId}`
      const raw = localStorage.getItem(key)
      if (raw) {
        const p = JSON.parse(raw)
        if (p && p.form) {
          const timeoutId = window.setTimeout(() => {
            setPendingDraftTemp({ key, payload: p })
          }, 0)
          return () => window.clearTimeout(timeoutId)
        }
      }
    } catch {}
  }, [draftId])

  // When slug becomes available, if there's a draft for that slug, show a prompt
  useEffect(()=>{
    if (!form.slug) return
    try {
      const key = `admin_credential_draft:${form.slug}`
      const raw = localStorage.getItem(key)
      if (raw) {
        const p = JSON.parse(raw)
        if (p && p.form) {
          const timeoutId = window.setTimeout(() => {
            setPendingDraftSlug({ key, payload: p })
          }, 0)
          return () => window.clearTimeout(timeoutId)
        }
      }
    } catch {}
  }, [form.slug])

  function applyDraftObject(draftObj: LocalDraft) {
    if (!draftObj || !draftObj.payload) return
    try {
      const p = draftObj.payload
      if (p && p.form) {
        setForm(f=>({ ...f, ...p.form }))
        showToast('Draft loaded', 'info')
      }
    } catch (err) { console.error('apply draft error', err) }
    setPendingDraftTemp(null)
    setPendingDraftSlug(null)
  }

  function discardDraftObject(draftObj: LocalDraft) {
    if (!draftObj) return
    try { localStorage.removeItem(draftObj.key) } catch {}
    setPendingDraftTemp(null)
    setPendingDraftSlug(null)
    showToast('Draft discarded', 'info')
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    if (!form.slug || !form.section) {
      setError('Select a section and enter a slug before uploading an image.')
      return
    }
    const MAX_BYTES = 50 * 1024 * 1024
    if (file.size > MAX_BYTES) {
      setError('Image is too large. The maximum supported size is 50MB.')
      return
    }
    // Use XHR for progress events and a prefix override so keys live under credentials/
    const sectionSlug = String(form.section || '').toLowerCase().replace(/[^a-z0-9]+/g,'-')
    const uploadSlug = `${sectionSlug}/${form.slug}`
    const fd = new FormData()
    fd.append('file', file)
    fd.append('slug', uploadSlug)
    fd.append('filename', file.name)
    fd.append('prefix', 'credentials/')
    setUploadProgress(-1)
    setUploadCompleted(false)
    try {
      await new Promise<void>((resolve, reject) => {
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
              setForm(f => ({ ...f, image_path: url, s3_prefix: uploadSlug }))
              setUploadProgress(0)
              setUploadCompleted(true)
              showToast('Image uploaded', 'success')
              resolve()
              return
            }
            reject(new Error(res?.error || 'Upload failed'))
          } catch (err) { reject(err) }
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(fd)
      })
    } catch (err) {
      console.error('upload error', err)
      const message = 'Upload error: ' + (err instanceof Error ? err.message : String(err))
      setError(message)
      showToast(message, 'error')
      setUploadProgress(0)
      setUploadCompleted(false)
    }
  }
  // Section management helpers

  async function submitSection(e?: React.FormEvent) {
    if (e) e.preventDefault()
    setError(null)
    try {
      const isUpdate = !!sectionForm.id
      const payload: Section = { ...sectionForm }
      if (!payload.name) {
        setError('Section name is required before saving.')
        return
      }
      if (!payload.slug) payload.slug = String(payload.name || '').toLowerCase().replace(/[^a-z0-9]+/g,'-')
      const res = await fetch('/admin/api/credential-sections', { method: isUpdate ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) {
        const message = data?.error || 'Error saving section'
        setError(message)
        showToast(message, 'error')
        return
      }
      const newSlug = payload.slug || (sectionForm.slug || String(sectionForm.name || '').toLowerCase().replace(/[^a-z0-9]+/g,'-'))
      setSectionForm(EMPTY_SECTION_FORM)
      setSectionSlugEdited(false)
      await loadSections()
      // auto-select the newly created section in the credential form
      setForm(f => ({ ...f, section: newSlug }))
      showToast(isUpdate ? 'Section updated' : 'Section created', 'success')
    } catch (err) {
      console.error('submitSection err', err)
      const message = err instanceof Error ? err.message : 'Error saving section'
      setError(message)
      showToast(message, 'error')
    }
  }

  async function deleteSection(id?: number) {
    if (!id) return
    if (!confirm('Delete this section?')) return
    try {
      await fetch(`/admin/api/credential-sections?id=${encodeURIComponent(String(id))}`, { method: 'DELETE' })
      await loadSections()
      showToast('Section deleted', 'success')
    } catch (err) { console.error('deleteSection err', err) }
  }

  function editSection(s?: Section) {
    if (!s) return
    setSectionForm({ id: s.id ?? null, name: s.name || '', slug: s.slug || '', subtitle: s.subtitle || '', image_path: s.image_path || '', sort_order: s.sort_order || 0 })
    setSectionSlugEdited(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function removeItem(id?: number) {
    if (!id) return
    const it = items.find(i => i.id === id)
    if (!it) return
    if (!confirm('Delete this credential?')) return
    try {
      // store deleted item for possible undo
      setDeletedUndoBuffer({ items: [it], ts: Date.now() })
      await fetch(`/admin/api/credentials?id=${encodeURIComponent(String(id))}`, { method: 'DELETE' })
      await load()
      setSelectedIds(s => s.filter(x => x !== id))
      showToast('Deleted', 'success')
      // clear undo buffer after 30s
      setTimeout(() => setDeletedUndoBuffer(null), 30_000)
    } catch (err) {
      console.error('delete error', err)
    }
  }

  function toggleSelect(id?: number) {
    if (id === undefined || id === null) return
    setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  async function performBulkAction(action: 'publish' | 'unpublish' | 'delete') {
    if (!selectedIds || selectedIds.length === 0) return
    setError(null)
    const ids = selectedIds.map(x => Number(x)).filter(n => Number.isFinite(n))
    if (ids.length === 0) return

    if (action === 'delete') {
      if (!confirm(`Delete ${ids.length} selected credential(s)?`)) return
      const toDelete = items.filter(it => ids.includes(Number(it.id)))
      if (toDelete.length) setDeletedUndoBuffer({ items: toDelete, ts: Date.now() })
    }

    try {
      const res = await fetch('/admin/api/credentials/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ids }) })
      const data = await res.json()
      if (!res.ok) {
        const message = data?.error || 'Bulk action failed'
        setError(message)
        showToast(message, 'error')
        return
      }
      setSelectedIds([])
      await load()
      showToast(action === 'delete' ? 'Deleted selected' : action === 'publish' ? 'Published selected' : 'Unpublished selected', 'success')
      if (action === 'delete') setTimeout(() => setDeletedUndoBuffer(null), 30_000)
    } catch (err) {
      console.error('bulk action error', err)
      setError('Bulk action failed')
      showToast('Bulk action failed', 'error')
    }
  }

  async function undoDelete() {
    if (!deletedUndoBuffer || !deletedUndoBuffer.items) return
    const list = Array.isArray(deletedUndoBuffer.items) ? deletedUndoBuffer.items : [deletedUndoBuffer.items]
    for (const it of list) {
      try {
        const payload: Partial<CredItem> = { section: it.section, slug: it.slug, title: it.title, tag: it.tag, authority: it.authority, image_path: it.image_path || '', description: it.description || '', is_published: it.is_published || 0, sort_order: it.sort_order || 0 }
        await fetch('/admin/api/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      } catch (err) { console.error('undo create err', err) }
    }
    setDeletedUndoBuffer(null)
    await load()
    showToast('Undo complete', 'success')
  }

  function moveItemUp(id?: number) {
    if (!id) return
    setItems(prev => {
      const idx = prev.findIndex(p => p.id === id)
      if (idx <= 0) return prev
      const arr = [...prev]
      const [item] = arr.splice(idx, 1)
      arr.splice(idx - 1, 0, item)
      return arr.map((it, i) => ({ ...it, sort_order: i }))
    })
    setNeedOrderSave(true)
  }

  function moveItemDown(id?: number) {
    if (!id) return
    setItems(prev => {
      const idx = prev.findIndex(p => p.id === id)
      if (idx === -1 || idx >= prev.length - 1) return prev
      const arr = [...prev]
      const [item] = arr.splice(idx, 1)
      arr.splice(idx + 1, 0, item)
      return arr.map((it, i) => ({ ...it, sort_order: i }))
    })
    setNeedOrderSave(true)
  }

  async function saveOrder() {
    try {
      const payload = items.map(it => ({ id: it.id, sort_order: it.sort_order || 0 }))
      try { console.debug('[admin/credentials] manual saveOrder payload', payload) } catch {}
      const res = await fetch('/admin/api/credentials/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: payload }) })
      const data = await res.json().catch(()=>({}))
      try { console.debug('[admin/credentials] manual saveOrder response', res.status, data) } catch {}
      setNeedOrderSave(false)
      await load()
      showToast('Order saved', 'success')
    } catch (err) { console.error('save order err', err) }
  }

  async function saveSectionOrder() {
    try {
      const payload = (sections || []).map((s) => ({ id: s.id, sort_order: s.sort_order || 0 }))
      try { console.debug('[admin/credentials] manual saveSectionOrder payload', payload) } catch {}
      const res = await fetch('/admin/api/credential-sections/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: payload }) })
      const data = await res.json().catch(() => ({}))
      try { console.debug('[admin/credentials] manual saveSectionOrder response', res.status, data) } catch {}
      if (!res.ok) {
        const message = 'Save section order failed: ' + (data?.error || res.status)
        setError(message)
        showToast(message, 'error')
        return
      }
      setNeedSectionOrderSave(false)
      await loadSections()
      showToast('Sections order saved', 'success')
    } catch (err) {
      console.error('saveSectionOrder err', err)
      showToast('Sections order failed', 'error')
    }
  }

  // Drag & drop reorder support
  const dragIndexRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  function handleDragStart(e: React.DragEvent, idx: number) {
    dragIndexRef.current = idx
    try { e.dataTransfer.setData('text/plain', String(idx)) } catch {}
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDragOverIndex(idx)
  }

  function handleDragLeave() {
    setDragOverIndex(null)
  }

  async function handleDrop(e: React.DragEvent, idx: number) {
    e.preventDefault()
    const srcStr = (() => { try { return e.dataTransfer.getData('text/plain') } catch { return null } })()
    const srcIdx = srcStr ? Number(srcStr) : dragIndexRef.current
    if (srcIdx === null || srcIdx === undefined || isNaN(srcIdx)) { setDragOverIndex(null); dragIndexRef.current = null; return }
    if (srcIdx === idx) { setDragOverIndex(null); dragIndexRef.current = null; return }

    // compute new items array from current state and apply locally
    const prev = items || []
    const arr = [...prev]
    const [item] = arr.splice(srcIdx, 1)
    arr.splice(idx, 0, item)
    const newItems = arr.map((it, i) => ({ ...it, sort_order: i }))
    setItems(newItems)
    try { console.debug('[admin/credentials] handleDrop newItems', newItems.map((i)=>({ id: i.id, sort_order: i.sort_order }))) } catch {}

    // persist immediately so front-end reflects server ordering
    try {
      const payload = newItems.map(it => ({ id: it.id, sort_order: it.sort_order || 0 }))
      try { console.debug('[admin/credentials] posting order payload', payload) } catch {}
      const res = await fetch('/admin/api/credentials/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: payload }) })
      const data = await res.json().catch(() => ({}))
      try { console.debug('[admin/credentials] order response', res.status, data) } catch {}
      if (!res.ok) { console.error('Save order failed', data); setNeedOrderSave(true) } else {
        setNeedOrderSave(false)
        await load()
        showToast('Order saved', 'success')
      }
    } catch (err) {
      console.error('save order err', err)
      setNeedOrderSave(true)
    }

    setDragOverIndex(null)
    dragIndexRef.current = null
  }

  // Section reorder support
  const sectionDragIndexRef = useRef<number | null>(null)
  const [sectionDragOverIndex, setSectionDragOverIndex] = useState<number | null>(null)
  const [needSectionOrderSave, setNeedSectionOrderSave] = useState(false)

  function handleSectionDragStart(e: React.DragEvent, idx: number) {
    sectionDragIndexRef.current = idx
    try { e.dataTransfer.setData('text/section', String(idx)) } catch {}
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleSectionDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setSectionDragOverIndex(idx)
  }

  function handleSectionDragLeave() {
    setSectionDragOverIndex(null)
  }

  async function handleSectionDrop(e: React.DragEvent, idx: number) {
    e.preventDefault()
    const srcStr = (() => { try { return e.dataTransfer.getData('text/section') } catch { return null } })()
    const srcIdx = srcStr ? Number(srcStr) : sectionDragIndexRef.current
    if (srcIdx === null || srcIdx === undefined || isNaN(srcIdx)) { setSectionDragOverIndex(null); sectionDragIndexRef.current = null; return }
    if (srcIdx === idx) { setSectionDragOverIndex(null); sectionDragIndexRef.current = null; return }

    const prev = sections || []
    const arr = [...prev]
    const [item] = arr.splice(srcIdx, 1)
    arr.splice(idx, 0, item)
    const newSections = arr.map((it, i: number) => ({ ...it, sort_order: i }))
    setSections(newSections)

    // persist section order immediately
    try {
      const payload = newSections.map((s) => ({ id: s.id, sort_order: s.sort_order || 0 }))
      const res = await fetch('/admin/api/credential-sections/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: payload }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = 'Save section order failed: ' + (data?.error || res.status)
        setError(message)
        showToast(message, 'error')
        setNeedSectionOrderSave(true)
      } else {
        setNeedSectionOrderSave(false)
        await loadSections()
        showToast('Sections order saved', 'success')
      }
    } catch (err) {
      console.error('saveSectionOrder err', err)
      setNeedSectionOrderSave(true)
    }

    setSectionDragOverIndex(null)
    sectionDragIndexRef.current = null
  }

  // Card drag support within/between sections
  const cardDragRef = useRef<{ section: string; index: number } | null>(null)

  function handleCardDragStart(e: React.DragEvent, section: string, idx: number) {
    cardDragRef.current = { section, index: idx }
    try { e.dataTransfer.setData('text/card', JSON.stringify({ section, index: idx })) } catch {}
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleCardDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function handleCardDragLeave() {}

  async function handleCardDrop(e: React.DragEvent, targetSection: string, targetIndex: number) {
    e.preventDefault()
    const srcStr = (() => { try { return e.dataTransfer.getData('text/card') } catch { return null } })()
    let src = null
    if (srcStr) {
      try { src = JSON.parse(srcStr) } catch { src = null }
    }
    const srcObj = src || cardDragRef.current
    if (!srcObj) { cardDragRef.current = null; return }
    const { section: srcSection, index: srcIndex } = srcObj
    if (srcSection === targetSection && srcIndex === targetIndex) { cardDragRef.current = null; return }

    // Build grouped map
    const grouped: Record<string, CredItem[]> = {}
    for (const s of sections) { const key = String((s as Record<string, unknown>)['slug'] || ''); grouped[key] = [] }
    // include any items that have no matching section
    const unsect: CredItem[] = []
    items.forEach(it => {
      if (it && it.section && grouped[it.section]) grouped[it.section].push(it)
      else unsect.push(it)
    })

    // ensure items sorted by current sort_order within groups
    Object.keys(grouped).forEach(k => grouped[k].sort((a,b)=> (a.sort_order||0)-(b.sort_order||0)))

    // find source item
    const srcList = grouped[srcSection] || []
    const [moved] = srcList.splice(srcIndex, 1)
    if (!moved) { cardDragRef.current = null; return }

    // if moving between sections, update its section property
    moved.section = targetSection

    const destList = grouped[targetSection] || []
    destList.splice(targetIndex, 0, moved)

    // rebuild new items array by concatenating groups in the order of sections
    const newItems: CredItem[] = []
    for (const s of sections) {
      const key = String((s as Record<string, unknown>)['slug'] || '')
      const list = grouped[key] || []
      for (let i = 0; i < list.length; i++) {
        list[i].sort_order = i
        newItems.push(list[i])
      }
    }
    // append uncategorized
    for (const u of unsect) newItems.push(u)

    setItems(newItems)
    setNeedOrderSave(true)
    try { console.debug('[admin/credentials] handleCardDrop newItems', newItems.map((i)=>({ id: i.id, section: i.section, sort_order: i.sort_order }))) } catch {}
    cardDragRef.current = null

    // persist moved card section immediately (so s3_prefix can be recomputed server-side)
    try {
      try { console.debug('[admin/credentials] updating moved item section', { id: moved.id, section: moved.section, slug: moved.slug }) } catch {}
      const res = await fetch('/admin/api/credentials', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: moved.id, section: moved.section, slug: moved.slug, title: moved.title, tag: moved.tag, authority: moved.authority, image_path: moved.image_path, description: moved.description, is_published: moved.is_published ? 1 : 0, sort_order: moved.sort_order || 0 }) })
      try { console.debug('[admin/credentials] update moved item response', res.status) } catch {}
    } catch (err) {
      console.error('persist moved card section error', err)
    }
    // persist new ordering for all items so front-end and back-end stay in sync
    try {
      const payload = newItems.map(it => ({ id: it.id, sort_order: it.sort_order || 0 }))
      try { console.debug('[admin/credentials] posting order payload (card drop)', payload) } catch {}
      const res = await fetch('/admin/api/credentials/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: payload }) })
      const data = await res.json().catch(() => ({}))
      try { console.debug('[admin/credentials] order response (card drop)', res.status, data) } catch {}
      if (!res.ok) { console.error('Save order failed', data); setNeedOrderSave(true) }
      else {
        setNeedOrderSave(false)
        await load()
        showToast('Order saved', 'success')
      }
    } catch (err) {
      console.error('save order err', err)
      setNeedOrderSave(true)
    }
  }

  const purify = typeof window !== 'undefined' ? createDOMPurify(window as unknown as Window & typeof globalThis) : null
  if (purify && typeof purify.setConfig === 'function') purify.setConfig({ FORBID_TAGS: ['script', 'style'] })

  const groupedItems = React.useMemo(() => {
    const groups: Record<string, CredItem[]> = {};
    for (const s of sections || []) { const slug = s.slug || ''; if (slug) groups[slug] = [] }
    const others: CredItem[] = [];
    (items || []).forEach(it => {
      if (it && it.section && groups[it.section]) groups[it.section].push(it)
      else others.push(it)
    })
    Object.keys(groups).forEach(k => groups[k].sort((a,b) => (a.sort_order||0)-(b.sort_order||0)))
    return { groups, others }
  }, [items, sections])

  return (
    <main className={styles.pageBody}>
          {error ? <AdminNotice message={error} variant="error" actionLabel="Retry" onAction={() => { void load(); void loadSections() }} /> : null}
          <div className={styles.adminTop}>
            <div>
              <h2 className="title">Credentials</h2>
              <div className={styles.smallMuted + ' ' + styles.mt6}>Manage credential sections and items</div>
            </div>
            {mounted ? (
              <div className={styles.topActions}>
                <div className={styles.topActionsInner}>
                  <button className={styles.btnGhost} type="button" onClick={load}>Refresh</button>
                  <button className={styles.btnGhost} type="button" onClick={()=>performBulkAction('publish')} disabled={selectedIds.length===0}>Publish selected</button>
                  <button className={styles.btnGhost} type="button" onClick={()=>performBulkAction('unpublish')} disabled={selectedIds.length===0}>Unpublish selected</button>
                  <button className={styles.btnDanger} type="button" onClick={()=>performBulkAction('delete')} disabled={selectedIds.length===0}>Delete selected</button>
                </div>
                <button className={styles.btnGhost} type="button" onClick={saveOrder} disabled={!needOrderSave}>Save order</button>
              </div>
            ) : (
              <div className={styles.topActions} aria-hidden />
            )}
          </div>
          {deletedUndoBuffer && (
            <div className={styles.adminSectionCard + ' ' + styles.undoBannerFull} suppressHydrationWarning>
              <div className={styles.smallMuted}>Item(s) deleted. You can undo this action for a short time.</div>
              <div className={styles.draftActions}>
                <button className={styles.btnGhost} onClick={undoDelete}>Undo</button>
                <button className={styles.btnGhost} onClick={()=>setDeletedUndoBuffer(null)}>Dismiss</button>
              </div>
            </div>
          )}
          <div className="stack">
            <div className={styles.editorGrid}>
              <div>
                <form suppressHydrationWarning onSubmit={submit} className="form-grid">
                  {(pendingDraftTemp || pendingDraftSlug) && (
                    <div className={styles.draftPrompt}>
                      <div className={styles.rowBetween12}>
                        <div>
                          <div className={styles.draftPromptTitle}>{pendingDraftTemp ? 'Unsaved draft found' : `Draft available for "${form.slug}"`}</div>
                          <div className={`${styles.smallMuted} ${styles.mt6}`}>{pendingDraftTemp ? 'You have an unsaved draft from a previous session.' : 'A local draft exists for this slug.'}</div>
                        </div>
                        <div className={styles.actionsRow}>
                          <button type="button" className={styles.btnGhost} onClick={()=>applyDraftObject(pendingDraftTemp || pendingDraftSlug)}>Load draft</button>
                          <button type="button" className={styles.btnGhost} onClick={()=>discardDraftObject(pendingDraftTemp || pendingDraftSlug)}>Discard</button>
                        </div>
                      </div>
                    </div>
                  )}
                  <label>
                    <div className="field-label">Section</div>
                    <div className={styles.inputRow}>
                      <select suppressHydrationWarning value={form.section} onChange={e=>setForm({...form, section: e.target.value})} className={styles.formInput}>
                        <option value="">-- Select section --</option>
                        {sectionsLoading ? <option disabled>Loading sections...</option> : sections.map(s => (
                          <option key={s.id} value={s.slug}>{s.name}{s.subtitle ? ` — ${s.subtitle}` : ''}</option>
                        ))}
                      </select>
                      <button type="button" className={styles.btnGhost} onClick={()=>setShowSectionsPanel(s=>!s)}>{showSectionsPanel ? 'Hide' : 'Manage'}</button>
                    </div>
                  </label>
                  <label>
                    <div className="field-label">Slug</div>
                    <input suppressHydrationWarning value={form.slug} onChange={e=>{ setSlugEdited(true); setForm({...form, slug: e.target.value}) }} className={styles.formInput} />
                  </label>
                  <label>
                    <div className="field-label">Title</div>
                    <input suppressHydrationWarning value={form.title} onChange={e=>{
                      const title = e.target.value
                      if (!slugEdited) {
                        const s = title.toLowerCase().trim().replace(/[^a-z0-9\s-_]/g, '').replace(/\s+/g, '-')
                        setForm(f=>({ ...f, title, slug: s }))
                      } else {
                        setForm(f=>({ ...f, title }))
                      }
                    }} className={styles.formInput} />
                  </label>
                  <label>
                    <div className="field-label">Authority</div>
                    <input suppressHydrationWarning value={form.authority} onChange={e=>setForm({...form, authority: e.target.value})} className={styles.formInput + ' ' + styles.formInputSubtitle + ' ' + styles.formInputCenter} />
                  </label>
                  <label>
                    <div className="field-label">Tag / Label</div>
                    <input suppressHydrationWarning value={form.tag} onChange={e=>setForm({...form, tag: e.target.value})} className={styles.formInput} />
                  </label>
                  <label>
                    <div className="field-label">Image path</div>
                    <div className={styles.inputRow}>
                      <input suppressHydrationWarning value={form.image_path || ''} onChange={e=>setForm({...form, image_path: e.target.value})} className={styles.formInput} />
                      <label className={`${styles.btnGhost} ${styles.btnGhostSmall} ${styles.inlineBtnLabel}`}>
                        <input type="file" accept="image/*" onChange={handleFileChange} className={styles.srOnlyInput} />
                        Upload image
                      </label>
                      <button type="button" className={styles.btnGhost} onClick={()=>{ setForm(f=>({...f, image_path: ''})); setUploadCompleted(false); }}>Clear</button>
                    </div>
                    <div className={styles.mt6}>
                      {uploadProgress < 0 ? (
                        <span className={styles.uploadStatus}>Uploading…</span>
                      ) : uploadProgress > 0 ? (
                        <progress className={`${styles.progressNative} ${styles.progressWide}`} max={100} value={uploadProgress} aria-label="Credential image upload progress" />
                      ) : uploadCompleted ? (
                        <div className={styles.uploadSuccess}>Upload complete ✓</div>
                      ) : null}
                    </div>
                  </label>
                  <label>
                    <div className="field-label">Description (HTML allowed)</div>
                    <RichTextEditor
                      value={String(form.description || '')}
                      onChange={(value) => setForm(f => ({ ...f, description: value }))}
                      placeholder="Write the credential description…"
                      minHeight={220}
                    />
                  </label>
                    <div>
                      <div className="field-label">Published</div>
                      <label className={styles.switch + ' ' + styles.switchSmall}>
                        <input suppressHydrationWarning type="checkbox" checked={!!form.is_published} onChange={e=>setForm({...form, is_published: e.target.checked ? 1 : 0})} />
                        <span className={`${styles.slider} ${form.is_published ? styles.on : ''}`} />
                        <span className={styles.switchLabel}>{form.is_published ? 'Published' : 'Draft'}</span>
                      </label>
                    </div>

                  <div className="flex gap-2">
                    <button className={styles.btnGhost} type="submit">{form.id ? 'Save' : 'Create'}</button>
                    <button type="button" className={styles.btnGhost} onClick={()=>setPreviewOpen(true)}>Preview</button>
                    {form.id ? (
                      <button type="button" className={styles.btnGhost} onClick={()=>{ clearDraft(); resetForm() }}>Cancel edit</button>
                    ) : null}
                    <button type="button" className={styles.btnGhost} onClick={()=>{ clearDraft(); resetForm(); showToast('Draft discarded', 'info') }}>Discard draft</button>
                  </div>
                </form>
              </div>

              <aside>
                <div className={`${styles.panel} ${styles.panelCompact}`}>
                  <div className={styles.rowBetween12}>
                    <div>
                      <div className={styles.fieldLabel}>Credentials</div>
                      <div className="muted">Total: {items.length}</div>
                    </div>
                    <div className={styles.actionsRow}>
                      <button className={styles.btnGhost} type="button" onClick={load}>Refresh</button>
                      <button className={styles.btnGhost} type="button" onClick={()=>performBulkAction('publish')} disabled={selectedIds.length===0}>Publish selected</button>
                      <button className={styles.btnGhost} type="button" onClick={()=>performBulkAction('unpublish')} disabled={selectedIds.length===0}>Unpublish selected</button>
                      <button className={styles.btnDanger} type="button" onClick={()=>performBulkAction('delete')} disabled={selectedIds.length===0}>Delete selected</button>
                      <button className={styles.btnGhost} type="button" onClick={saveOrder} disabled={!needOrderSave}>Save order</button>
                    </div>
                  </div>
                  <div className={styles.sectionPanel}>
                    <div className={`${styles.smallMuted} ${styles.panelHint}`}>Tip: click Edit on a card to populate the form (not implemented: single-edit yet).</div>
                    {uploadProgress < 0 ? (
                      <span className={styles.uploadStatus}>Uploading…</span>
                    ) : uploadProgress > 0 ? (
                      <progress className={`${styles.progressNative} ${styles.progressCompact} ${styles.progressBlock}`} max={100} value={uploadProgress} aria-label="Credentials upload progress" />
                    ) : null}

                    <div className={styles.sectionPanel}>
                      <button className={styles.btnGhost} type="button" onClick={() => setShowSectionsPanel(s => !s)}>{showSectionsPanel ? 'Hide Sections' : 'Manage Sections'}</button>
                    </div>

                    {showSectionsPanel && (
                      <div className={styles.sectionPanel}>
                        <form onSubmit={submitSection} className="form-grid">
                          <label>
                            <div className="field-label">Name</div>
                            <input value={sectionForm.name} onChange={e => {
                              const name = e.target.value
                              if (!sectionSlugEdited) {
                                const slug = String(name || '').toLowerCase().trim().replace(/[^a-z0-9\s-_]/g, '').replace(/\s+/g, '-')
                                setSectionForm((s) => ({ ...s, name, slug } as Section))
                              } else {
                                setSectionForm((s) => ({ ...s, name } as Section))
                              }
                            }} className={styles.formInput} />
                          </label>
                          <label>
                            <div className="field-label">Slug</div>
                            <input value={sectionForm.slug} onChange={e => { setSectionSlugEdited(true); setSectionForm((s) => ({ ...s, slug: e.target.value } as Section)) }} className={styles.formInput} />
                          </label>
                          <label>
                            <div className="field-label">Subtitle</div>
                            <input value={sectionForm.subtitle} onChange={e => setSectionForm((s) => ({ ...s, subtitle: e.target.value } as Section))} className={styles.formInput} />
                          </label>
                          <div className="flex gap-2">
                            <button className={styles.btnGhost} type="button" onClick={() => submitSection()}>{sectionForm.id ? 'Save' : 'Create'}</button>
                            {sectionForm.id ? (
                              <button className={styles.btnGhost} type="button" onClick={() => setSectionForm(EMPTY_SECTION_FORM)}>Cancel</button>
                            ) : null}
                          </div>
                        </form>

                        <hr />
                        <div>
                          <div className={styles.sectionHeader}>
                            <div className={styles.titleStrong}>Sections</div>
                            <div className={styles.actionsRow}>
                              <button className={styles.btnGhost} type="button" onClick={loadSections}>Refresh</button>
                              <button className={styles.btnGhost} type="button" onClick={saveSectionOrder} disabled={!needSectionOrderSave}>Save order</button>
                            </div>
                          </div>
                          {sectionsLoading ? <div className={styles.smallMuted}>Loading sections...</div> : sections.length === 0 ? <div className="muted">No sections</div> : sections.map((s, sIdx: number) => (
                            <div key={s.id} className={`${styles.sectionRow} ${sectionDragOverIndex === sIdx ? styles.sectionRowActive : ''}`} draggable onDragStart={(e)=>handleSectionDragStart(e, sIdx)} onDragOver={(e)=>handleSectionDragOver(e, sIdx)} onDragLeave={handleSectionDragLeave} onDrop={(e)=>handleSectionDrop(e, sIdx)}>
                              <div>
                                <div className={styles.sectionRowMain}>
                                  <div className={styles.dragHandle} aria-hidden>≡</div>
                                  <strong>{s.name}</strong>
                                </div>
                                <div className="muted">{s.slug}{s.subtitle ? ' — ' + s.subtitle : ''}</div>
                              </div>
                              <div className={styles.actionsRow}>
                                <button className={styles.btnGhost} onClick={() => editSection(s)}>Edit</button>
                                <button className={styles.btnDanger} onClick={() => deleteSection(s.id ?? undefined)}>Delete</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </aside>

              <div className={styles.fullSpan}>
                <hr />
                <div className={styles.sectionsGrid}>
                  {(sections && sections.length > 0) ? sections.map((s, sIdx: number) => (
                    <Card key={s.id} className={styles.adminSectionCard} title={s.name} subtitle={s.subtitle ? s.subtitle : s.slug}>
                      <div className={styles.sectionHeader}>
                        <div draggable onDragStart={(e)=>handleSectionDragStart(e, sIdx)} onDragOver={(e)=>handleSectionDragOver(e, sIdx)} onDragLeave={handleSectionDragLeave} onDrop={(e)=>handleSectionDrop(e, sIdx)} className={styles.sectionRowMain}>
                          <div className={styles.dragHandle} aria-hidden>≡</div>
                          <div className={`muted ${styles.muted12}`}>{s.slug}</div>
                        </div>
                        <div className={styles.actionsRow}>
                          <button className={styles.btnGhost} onClick={() => editSection(s)}>Edit</button>
                          <button className={styles.btnDanger} onClick={() => deleteSection(s.id ?? undefined)}>Delete</button>
                        </div>
                      </div>

                      <div>
                        {(groupedItems.groups[String((s as Record<string, unknown>)['slug'] || '')] || []).map((it, idx: number) => (
                          <div key={it.id} className={styles.credentialRow} draggable onDragStart={(e)=>handleCardDragStart(e, String(s.slug || ''), idx)} onDragOver={handleCardDragOver} onDragLeave={handleCardDragLeave} onDrop={(e)=>handleCardDrop(e, String(s.slug || ''), idx)}>
                            <div className={styles.credentialRowInner}>
                              <div className={styles.dragHandle} aria-hidden>≡</div>
                              <input type="checkbox" checked={it.id != null && selectedIds.includes(Number(it.id))} onChange={()=>{ if (it.id != null) toggleSelect(Number(it.id)) }} />
                              <div>
                                <strong>{it.title}</strong>
                                <div className={`${styles.smallMuted} ${styles.muted12}`}>{it.slug}</div>
                              </div>
                            </div>
                            <div className={styles.credentialActions}>
                              <button className={styles.btnGhost} onClick={()=>{ setForm({ id: it.id ?? null, section: it.section, slug: it.slug, title: it.title, tag: it.tag, authority: it.authority, image_path: it.image_path, description: it.description, is_published: it.is_published, sort_order: it.sort_order, s3_prefix: it.s3_prefix }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button>
                              <button className={styles.btnGhost} onClick={()=>moveItemUp(it.id == null ? undefined : Number(it.id))}>Up</button>
                              <button className={styles.btnGhost} onClick={()=>moveItemDown(it.id == null ? undefined : Number(it.id))}>Down</button>
                              <button className={styles.btnDanger} onClick={()=>removeItem(it.id == null ? undefined : Number(it.id))}>Delete</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )) : (
                    <div className={styles.stackGrid8}>
                      {items.map((it, idx) => (
                        <div key={it.id} className={styles.sectionRow} draggable onDragStart={(e)=>handleDragStart(e, idx)} onDragOver={(e)=>handleDragOver(e, idx)} onDragLeave={handleDragLeave} onDrop={(e)=>handleDrop(e, idx)}>
                          <div className={styles.sectionRowMain + ' ' + styles.flex1}>
                            <div className={`${styles.dragHandle} ${dragOverIndex === idx ? styles.dragHandleActive : ''}`} aria-hidden>≡</div>
                            <input type="checkbox" checked={it.id != null && selectedIds.includes(Number(it.id))} onChange={()=>{ if (it.id != null) toggleSelect(Number(it.id)) }} />
                            <div>
                              <strong>{it.title}</strong> <span className="muted">({it.section})</span>
                              <div className={styles.smallMuted}>{it.slug}</div>
                            </div>
                          </div>
                          <div className={styles.actionsRow}>
                            <button className={styles.btnGhost} onClick={()=>{ setForm({ id: it.id ?? null, section: it.section, slug: it.slug, title: it.title, tag: it.tag, authority: it.authority, image_path: it.image_path, description: it.description, is_published: it.is_published, sort_order: it.sort_order, s3_prefix: it.s3_prefix }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button>
                            <button className={styles.btnGhost} onClick={()=>moveItemUp(it.id == null ? undefined : Number(it.id))}>Up</button>
                            <button className={styles.btnGhost} onClick={()=>moveItemDown(it.id == null ? undefined : Number(it.id))}>Down</button>
                            <button className={styles.btnDanger} onClick={()=>removeItem(it.id == null ? undefined : Number(it.id))}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {groupedItems.others && groupedItems.others.length > 0 ? (
                    <div className={styles.sectionPanel}>
                      <div className={`${styles.titleStrong} ${styles.mb8}`}>Uncategorized</div>
                      {groupedItems.others.map((it) => (
                        <div key={it.id} className={styles.sectionRow}>
                          <div className={styles.sectionRowMain + ' ' + styles.flex1}>
                            <input type="checkbox" checked={it.id != null && selectedIds.includes(Number(it.id))} onChange={()=>{ if (it.id != null) toggleSelect(Number(it.id)) }} />
                            <div>
                              <strong>{it.title}</strong>
                              <div className={styles.smallMuted}>{it.slug}</div>
                            </div>
                          </div>
                          <div className={styles.actionsRow}>
                            <button className={styles.btnGhost} onClick={()=>{ setForm({ id: it.id ?? null, section: it.section, slug: it.slug, title: it.title, tag: it.tag, authority: it.authority, image_path: it.image_path, description: it.description, is_published: it.is_published, sort_order: it.sort_order, s3_prefix: it.s3_prefix }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button>
                            <button className={styles.btnGhost} onClick={()=>moveItemUp(it.id == null ? undefined : Number(it.id))}>Up</button>
                            <button className={styles.btnGhost} onClick={()=>moveItemDown(it.id == null ? undefined : Number(it.id))}>Down</button>
                            <button className={styles.btnDanger} onClick={()=>removeItem(it.id == null ? undefined : Number(it.id))}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              {previewOpen && (
                <div className={styles.modalOverlay} onClick={()=>setPreviewOpen(false)}>
                  <div className={styles.modalContent} onClick={(e)=>e.stopPropagation()} role="dialog" aria-modal="true">
                    <div className={`${styles.rowBetween12} ${styles.mb12}`}>
                      <div className={styles.titleStrong}>Preview</div>
                      <button className={styles.btnGhost} onClick={()=>setPreviewOpen(false)}>Close</button>
                    </div>
                    <div className={styles.previewDialogBody}>
                      <Card title={form.title || 'Untitled'} subtitle={(sections.find((s)=>s.slug===form.section)?.name) || form.section || ''}>
                        <div className={styles.previewContentRow}>
                          <div className={styles.previewMedia}>
                            <AdminObjectImage src={form.image_path} alt={form.title || 'Credential preview image'} width={140} height={100} fallbackLabel="No image" />
                          </div>
                          <div className={styles.previewCopy}>
                            <div className={styles.previewHtml} dangerouslySetInnerHTML={{ __html: (((form as Record<string, unknown>)['description_sanitized'] ?? (purify ? purify.sanitize(String(form.description || '')) : (form.description || ''))) as string) }} />
                          </div>
                        </div>
                      </Card>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
    </main>
  )
}
