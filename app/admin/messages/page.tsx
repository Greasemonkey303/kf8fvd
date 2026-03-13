"use client"

import React, { useEffect, useState, useRef } from 'react'
import styles from './page.module.css'
import Modal from '@/components/modal/Modal'

type Msg = { id: number; name?: string | null; email?: string | null; message?: string | null; attachments?: any[]; ip?: string | null; user_agent?: string | null; is_read?: boolean; created_at?: string }

export default function Page() {
  const [items, setItems] = useState<Msg[]>([])
  const [selected, setSelected] = useState<Msg | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name?: string | null; fromModal?: boolean } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const confirmCancelRef = useRef<HTMLButtonElement | null>(null)
  const closeModalBtnRef = useRef<HTMLButtonElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [limit] = useState(100)

  async function load(p = 1) {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/messages?page=${p}&limit=${limit}`)
      const j = await res.json()
      setItems(j.items || [])
    } catch (e) {
      console.error('Failed to load messages', e)
      setItems([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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
              <tr key={it.id} style={{fontWeight: it.is_read ? 400 : 700}}>
                <td className={styles.td}>{it.created_at ? (new Date(it.created_at).toLocaleString()) : '-'}</td>
                <td className={styles.td}>{it.name || '-'}</td>
                <td className={styles.td}>{it.email || '-'}</td>
                <td className={styles.td} style={{maxWidth:420}} dangerouslySetInnerHTML={{__html: (it.message || '') .replace(/\n/g, '<br/>').substring(0, 1000)}} />
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
        <Modal overlayClassName={styles.modalOverlay} contentClassName={styles.modalContent} onClose={closeModal} initialFocusRef={closeModalBtnRef} titleId={`msg-title-${selected.id}`}>
          <div className={styles.modalHeader}>
            <div style={{fontWeight:700}} id={`msg-title-${selected.id}`}>{selected.name || 'Message'}</div>
            <div style={{marginLeft:'auto', display:'flex', gap:8}}>
              <button className={styles.btnGhost} onClick={() => { markNoReload(selected.id, false); setSelected({ ...selected, is_read: false }) }}>Mark unread</button>
              <button className={styles.btnGhost} onClick={() => { window.location.href = `mailto:${selected.email || ''}` }}>Email</button>
              <button className={styles.btnGhost} onClick={() => { setConfirmDelete({ id: selected.id, name: selected.name, fromModal: true }) }}>Delete</button>
              <button ref={closeModalBtnRef} className={styles.btnGhost} onClick={closeModal}>Close</button>
            </div>
          </div>
          <div className={styles.modalBody}>
            <div style={{color:'var(--white-85)', marginBottom:8}}>When: {selected.created_at ? new Date(selected.created_at).toLocaleString() : '-'}</div>
            <div style={{display:'flex', gap:12, flexWrap:'wrap', marginBottom:8}}>
              <div style={{color:'var(--white-85)'}}>From: {selected.name || '-'}</div>
              <div style={{color:'var(--white-85)'}}>Email: {selected.email ? <a href={`mailto:${selected.email}`}>{selected.email}</a> : '-'}</div>
              <div style={{color:'var(--white-85)'}}>IP: {selected.ip || '-'}</div>
            </div>
            <div style={{border:'1px solid rgba(255,255,255,0.04)', borderRadius:8, padding:12, background:'var(--card-bg)'}} dangerouslySetInnerHTML={{ __html: (selected.message || '').replace(/\n/g, '<br/>') }} />

            {selected.attachments && selected.attachments.length > 0 && (
              <div style={{marginTop:12}}>
                <div style={{fontWeight:700, marginBottom:6}}>Attachments</div>
                <ul>
                  {selected.attachments.map((a: any, i: number) => (
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
            <div style={{marginTop:12, color:'var(--white-66)', fontSize:13}}>User agent: {selected.user_agent || '-'}</div>
          </div>
        </Modal>
      )}
      {confirmDelete && (
        <Modal overlayClassName={styles.modalOverlay} contentClassName={styles.modalContent} onClose={() => setConfirmDelete(null)} initialFocusRef={confirmCancelRef} titleId="confirm-delete-title" descriptionId="confirm-delete-desc">
          <div className={styles.modalHeader}>
            <div style={{fontWeight:700}} id="confirm-delete-title">Confirm delete</div>
          </div>
          <div className={styles.modalBody}>
            <div id="confirm-delete-desc">Are you sure you want to delete this message{confirmDelete.name ? ` from ${confirmDelete.name}` : ''}? This action cannot be undone.</div>
            <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:12}}>
              <button ref={confirmCancelRef} className={styles.btnGhost} onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</button>
              <button className={styles.btnDanger} onClick={() => doDelete()} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  )
}
