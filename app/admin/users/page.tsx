"use client"

import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import styles from '../admin.module.css'

type UserItem = { id: number; name: string; email: string; is_active: number; roles?: string[] }

const AVAILABLE_ROLES = ['admin', 'editor', 'author']

export default function AdminUsers() {
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', email: '', password: '', roles: [] as string[] })

  async function load() {
    setLoading(true)
    const res = await fetch('/admin/api/users')
    const data = await res.json()
    setUsers((data && data.items) ? data.items : [])
    setLoading(false)
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.email || !form.password) return
    await fetch('/admin/api/users', { method: 'POST', body: JSON.stringify(form) })
    setForm({ name: '', email: '', password: '', roles: [] })
    await load()
  }

  return (
    <main className={styles.pageBody}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <h2 className={styles.pageTitle}>Users</h2>
          <div className={styles.pageSubtitle}>Create administrators or editors and review existing roles.</div>
        </div>
      </div>
      <div className={styles.simpleStack}>
        <form onSubmit={submit} className="form-grid" suppressHydrationWarning>
          <label>
            <div className={styles.fieldLabel}>Name</div>
            <input value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className={styles.formInput} suppressHydrationWarning />
          </label>
          <label>
            <div className={styles.fieldLabel}>Email</div>
            <input type="email" value={form.email} onChange={e=>setForm({...form, email: e.target.value})} className={styles.formInput} suppressHydrationWarning />
          </label>
          <label>
            <div className={styles.fieldLabel}>Password</div>
            <input type="password" value={form.password} onChange={e=>setForm({...form, password: e.target.value})} className={styles.formInput} suppressHydrationWarning />
          </label>
          <div>
            <div className={styles.fieldLabel}>Role</div>
            <div className={styles.checkGroup}>
              {AVAILABLE_ROLES.map(r=> (
                <label key={r} className={styles.checkboxWrap}>
                  <input type="checkbox" checked={form.roles.includes(r)} onChange={e=>{
                    const next = form.roles.includes(r) ? form.roles.filter(x=>x!==r) : [...form.roles, r]
                    setForm({...form, roles: next})
                  }} className={styles.checkboxInput} />
                  <span className={styles.checkboxBox} aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </span>
                  <span className="muted">{r}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button className={styles.btnGhost} type="submit" suppressHydrationWarning>Create</button>
          </div>
        </form>

        <hr />

        {loading ? (
          <p>Loading…</p>
        ) : (
          <ul className={styles.simpleList}>
            {users.map(u => (
              <li key={u.id} className={styles.simpleListItem}>
                <div className={styles.itemMeta}>
                  <strong>{u.name || u.email}</strong> <span className="muted">{u.email}</span>
                  {u.roles && u.roles.length ? <div className="muted">Roles: {u.roles.join(', ')}</div> : null}
                </div>
                <div className="flex gap-2">
                  <Link className={styles.btnGhost} href={`/admin/users/${u.id}`}>Edit</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
