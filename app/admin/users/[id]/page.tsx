"use client"

import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import styles from '../../admin.module.css'
import Modal from '@/components/modal/Modal'

export default function UserEditor({ params }: { params: { id: string } }) {
  type UserListItem = { id?: string | number; name?: string; email?: string; is_active?: boolean; roles?: string[] }
  const id = (params as { id?: string }).id
  const router = useRouter()
  const [form, setForm] = useState({ id: 0, name: '', email: '', password: '', is_active: true, roles: [] as string[] })
  const [loading, setLoading] = useState(true)
  const AVAILABLE_ROLES = ['admin','editor','author']

  useEffect(() => {
    (async () => {
      const res = await fetch('/admin/api/users?page=1&limit=1000')
      const data = await res.json().catch(() => ({} as unknown))
      const items = (data as { items?: unknown }).items as UserListItem[] | undefined
      const found = items?.find(u => String(u.id) === String(id))
      if (found) setForm({ id: found.id as number, name: found.name || '', email: found.email || '', password: '', is_active: !!found.is_active, roles: found.roles || [] })
      setLoading(false)
    })()
  }, [id])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/admin/api/users', { method: 'PUT', body: JSON.stringify(form) })
    router.push('/admin/users')
  }
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null)

  async function confirmDelete() {
    try {
      await fetch(`/admin/api/users?id=${form.id}`, { method: 'DELETE' })
    } finally {
      setShowDeleteConfirm(false)
      router.push('/admin/users')
    }
  }

  return (
    <main className="page-pad">
      <div className="center-max">
        <div className={styles.panel}>
          <h2>Edit User — ID: {id}</h2>
          {loading ? <p>Loading…</p> : (
            <form onSubmit={save} className="form-grid">
              <label>
                <div className={styles.fieldLabel}>Name</div>
                <input value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className={styles.formInput} suppressHydrationWarning />
              </label>
              <label>
                <div className={styles.fieldLabel}>Email</div>
                <input type="email" value={form.email} onChange={e=>setForm({...form, email: e.target.value})} className={styles.formInput} suppressHydrationWarning />
              </label>
              <label>
                <div className={styles.fieldLabel}>Password (leave blank to keep)</div>
                <input type="password" value={form.password} onChange={e=>setForm({...form, password: e.target.value})} className={styles.formInput} suppressHydrationWarning />
              </label>
              <label>
                <div className={styles.fieldLabel}>Active</div>
                <input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form, is_active: e.target.checked})} suppressHydrationWarning />
              </label>

              <div>
                <div className={styles.fieldLabel}>Roles</div>
                <div className="flex gap-2">
                  {AVAILABLE_ROLES.map(r => (
                    <label key={r} className="flex items-center gap-2">
                      <input type="checkbox" checked={form.roles.includes(r)} onChange={e=>{
                        const next = form.roles.includes(r) ? form.roles.filter(x=>x!==r) : [...form.roles, r]
                        setForm({...form, roles: next})
                      }} />
                      <span className="muted">{r}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button className={styles.btnGhost} type="submit">Save</button>
                <button className={styles.btnGhost} type="button" onClick={()=>router.push('/admin/users')}>Cancel</button>
                <button className={styles.btnDanger} type="button" onClick={()=>setShowDeleteConfirm(true)}>Delete</button>
              </div>
            </form>
          )}
          {showDeleteConfirm && (
            <Modal overlayClassName="modal-overlay" contentClassName="modal card" onClose={() => setShowDeleteConfirm(false)} initialFocusRef={deleteCancelRef as unknown as React.RefObject<HTMLElement>} titleId="user-delete-title">
              <h4 id="user-delete-title">Confirm delete</h4>
              <p>Are you sure you want to delete this user? This action cannot be undone.</p>
              <div className="flex gap-2">
                <button className={styles.btnDanger} onClick={confirmDelete}>Delete</button>
                <button ref={deleteCancelRef} className={styles.btnGhost} onClick={()=>setShowDeleteConfirm(false)}>Cancel</button>
              </div>
            </Modal>
          )}
        </div>
      </div>
    </main>
  )
}
