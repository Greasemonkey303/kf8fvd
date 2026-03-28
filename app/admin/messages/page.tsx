"use client"

import React, { useEffect, useRef, useState } from 'react'
import createDOMPurify from 'dompurify'
import styles from './page.module.css'
import Modal from '@/components/modal/Modal'

function escapeHtml(str: string) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function makeSafeHtmlFromText(s: string) {
  const txt = String(s || '')
  return escapeHtml(txt).replace(/\n/g, '<br/>')
}

type Attachment = { url?: string | null; filename?: string | null }

type Msg = { id: number; name?: string | null; email?: string | null; message?: string | null; message_sanitized?: string | null; attachments?: Attachment[]; ip?: string | null; user_agent?: string | null; is_read?: boolean; created_at?: string }

export default function Page() {
  const [items, setItems] = useState<Msg[]>([])
  const [selected, setSelected] = useState<Msg | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name?: string | null; fromModal?: boolean } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const confirmCancelRef = useRef<HTMLButtonElement | null>(null)
  const closeModalBtnRef = useRef<HTMLButtonElement | null>(null)
  const [loading, setLoading] = useState(true)
  const page = 1
  const [limit] = useState(100)
  const loadRef = useRef(load)
  loadRef.current = load

  async function load(p = 1) {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/messages?page=${p}&limit=${limit}`, { cache: 'no-store' })
      const j = await res.json()
      setItems(j.items || [])
    } catch (error) {
      console.error('Failed to load messages', error)
      setItems([])
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadRef.current()
    const pollId = window.setInterval(() => { void loadRef.current(page) }, 30000)
    return () => window.clearInterval(pollId)
  }, [page])

  const purify = typeof window !== 'undefined' ? createDOMPurify(window as unknown as Window & typeof globalThis) : null
  if (purify && typeof purify.setConfig === 'function') purify.setConfig({ FORBID_TAGS: ['script', 'style'] })

  async function mark(id: number, read: boolean) {
    await fetch('/api/admin/messages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, read }) })
    await load(page)
  }

  // PATCH without reloading the whole list (optimistic update)
  async function markNoReload(id: number, read: boolean) {
    try {
      await fetch('/api/admin/messages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, read }) })
      setItems(prev => prev.map(i => i.id === id ? { ...i, is_read: read } : i))
      if (selected && selected.id === id) setSelected({ ...selected, is_read: read })
    } catch (e) {
      console.error('mark failed', e)
    }
  }

  async function markAllRead() {
    await fetch('/api/admin/messages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark_all_read' }) })
    await load(page)
  }

  function remove(id: number) {
    const name = items.find(i => i.id === id)?.name || null
    setConfirmDelete({ id, name, fromModal: false })
  }

  async function doDelete() {
    if (!confirmDelete) return
    const { id, fromModal } = confirmDelete
    setDeleting(true)
    try {
      await fetch(`/api/admin/messages?id=${id}`, { method: 'DELETE' })
      setConfirmDelete(null)
      if (fromModal) setSelected(null)
      await load(page)
    } catch (e) {
      console.error('delete failed', e)
    } finally {
      setDeleting(false)
    }
  }

  function viewMessage(msg: Msg) {
    // mark as read optimistically
    if (!msg.is_read) markNoReload(msg.id, true)
    setSelected(msg)
  }

  function closeModal() { setSelected(null) }

  

  return (
    <main className={styles.wrap}>
      <h1>Messages</h1>
      <div className={styles.controls}>
        <button className={styles.btnGhost} onClick={() => load(1)} disabled={loading}>Refresh</button>
        <button className={styles.btnGhost} onClick={() => markAllRead()} disabled={loading}>Mark all read</button>
      </div>
      {loading && <p>Loading…</p>}
      {!loading && items.length === 0 && <p>No messages.</p>}
      {!loading && items.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>When</th>
              <th className={styles.th}>From</th>
              <th className={styles.th}>Email</th>
              <th className={styles.th}>Message</th>
              <th className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id} className={it.is_read ? styles.readRow : styles.unreadRow}>
                <td className={styles.td}>{it.created_at ? (new Date(it.created_at).toLocaleString()) : '-'}</td>
                <td className={styles.td}>{it.name || '-'}</td>
                <td className={styles.td}>{it.email || '-'}</td>
                <td className={`${styles.td} ${styles.messagePreview}`} dangerouslySetInnerHTML={{__html: makeSafeHtmlFromText(String(it.message || '').substring(0, 1000))}} />
                <td className={styles.td}>
                  <div className={styles.controls}>
                    <button className={styles.btnGhost} onClick={() => viewMessage(it)}>View</button>
                    <a className={styles.btnGhost} href={`mailto:${it.email || ''}`}>Email</a>
                    <button className={styles.btnGhost} onClick={() => mark(it.id, !it.is_read)}>{it.is_read ? 'Mark unread' : 'Mark read'}</button>
                    <button className={styles.btnGhost} onClick={() => remove(it.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Modal */}
      {selected && (
        <Modal overlayClassName={styles.modalOverlay} contentClassName={styles.modalContent} onClose={closeModal} initialFocusRef={closeModalBtnRef as unknown as React.RefObject<HTMLElement>} titleId={`msg-title-${selected.id}`}>
          <div className={styles.modalHeader}>
            <div className={styles.modalTitle} id={`msg-title-${selected.id}`}>{selected.name || 'Message'}</div>
            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={() => { markNoReload(selected.id, false); setSelected({ ...selected, is_read: false }) }}>Mark unread</button>
              <button className={styles.btnGhost} onClick={() => { window.location.href = `mailto:${selected.email || ''}` }}>Email</button>
              <button className={styles.btnGhost} onClick={() => { setConfirmDelete({ id: selected.id, name: selected.name, fromModal: true }) }}>Delete</button>
              <button ref={closeModalBtnRef} className={styles.btnGhost} onClick={closeModal}>Close</button>
            </div>
          </div>
          <div className={styles.modalBody}>
            <div className={styles.metaSummary}>When: {selected.created_at ? new Date(selected.created_at).toLocaleString() : '-'}</div>
            <div className={styles.metaSummaryRow}>
              <div className={styles.metaSummary}>From: {selected.name || '-'}</div>
              <div className={styles.metaSummary}>Email: {selected.email ? <a href={`mailto:${selected.email}`}>{selected.email}</a> : '-'}</div>
              <div className={styles.metaSummary}>IP: {selected.ip || '-'}</div>
            </div>
            <div className={styles.messageBody} dangerouslySetInnerHTML={{ __html: (selected.message_sanitized ? (purify ? purify.sanitize(String(selected.message_sanitized)) : String(selected.message_sanitized)) : makeSafeHtmlFromText(selected.message || '')) }} />

            {selected.attachments && selected.attachments.length > 0 && (
              <div className={styles.attachmentsBlock}>
                <div className={styles.attachmentsTitle}>Attachments</div>
                <ul>
                  {selected.attachments.map((a: Attachment, i: number) => (
                    <li key={i} className={styles.attachment}>
                      {a && a.url ? (
                        <a className={styles.attachmentLink} href={a.url} target="_blank" rel="noopener noreferrer" download>
                          {a.filename}
                        </a>
                      ) : (
                        <span>{a.filename || JSON.stringify(a)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className={styles.userAgent}>User agent: {selected.user_agent || '-'}</div>
          </div>
        </Modal>
      )}
      {confirmDelete && (
        <Modal overlayClassName={styles.modalOverlay} contentClassName={styles.modalContent} onClose={() => setConfirmDelete(null)} initialFocusRef={confirmCancelRef as unknown as React.RefObject<HTMLElement>} titleId="confirm-delete-title" descriptionId="confirm-delete-desc">
          <div className={styles.modalHeader}>
            <div className={styles.modalTitle} id="confirm-delete-title">Confirm delete</div>
          </div>
          <div className={styles.modalBody}>
            <div id="confirm-delete-desc">Are you sure you want to delete this message{confirmDelete.name ? ` from ${confirmDelete.name}` : ''}? This action cannot be undone.</div>
            <div className={styles.confirmActions}>
              <button ref={confirmCancelRef} className={styles.btnGhost} onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</button>
              <button className={styles.btnDanger} onClick={() => doDelete()} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  )
}
