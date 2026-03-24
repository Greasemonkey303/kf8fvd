"use client"

import React, { useState } from 'react'
import styles from '../../admin.module.css'
import useAdmin from '../../../../components/hooks/useAdmin'
import Link from 'next/link'
import { useToast } from '../../../../components/toast/ToastProvider'

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'author', label: 'Standard user' },
  { value: 'editor', label: 'Editor' },
]

export default function CreateUserPage() {
  const { isAdmin, loading } = useAdmin()
  const toast = useToast()
  const [form, setForm] = useState({ name: '', email: '', password: '', roles: [] as string[] })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  if (loading) return <p>Loading…</p>
  if (!isAdmin) return (
    <main className="page-pad">
      <div className="center-max">
        <div className={styles.panel}>
          <h2>Unauthorized</h2>
          <p className={styles.smallMuted}>You must be an administrator to access this page.</p>
        </div>
      </div>
    </main>
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // basic client-side validation
    const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
    if (!form.email || !form.password) return setError('Email and password are required')
    if (!isValidEmail(String(form.email))) return setError('Please enter a valid email address')
    if (String(form.password).length < 8) return setError('Password must be at least 8 characters')
    if (!form.roles || form.roles.length === 0) return setError('Select at least one role')
    setSubmitting(true)
    try {
      const res = await fetch('/admin/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Create failed')
      setSuccess(true)
      try { toast?.showToast && toast.showToast('User created', 'success') } catch {}
      setForm({ name: '', email: '', password: '', roles: [] })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setSubmitting(false) }
  }

  function toggleRole(value: string) {
    setForm(prev => {
      const has = prev.roles.includes(value)
      return { ...prev, roles: has ? prev.roles.filter(r => r !== value) : [...prev.roles, value] }
    })
  }

  return (
    <main className="page-pad">
      <div className="center-max">
        <div className={styles.panel}>
          <h2>Create User</h2>
          <p className={styles.smallMuted}>Create users and assign roles. Available roles: Admin, Standard user, Editor.</p>

          <form onSubmit={submit} className="form-grid">
            <label>
              <div className={styles.fieldLabel}>Name</div>
              <input value={form.name} onChange={e => setForm({ ...form, name: String(e.target.value) })} className={styles.formInput} />
            </label>

            <label>
              <div className={styles.fieldLabel}>Email</div>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: String(e.target.value) })} className={styles.formInput} />
            </label>

            <label>
              <div className={styles.fieldLabel}>Password</div>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: String(e.target.value) })} className={styles.formInput} />
            </label>

            <div>
              <div className={styles.fieldLabel}>Roles</div>
              <div className={styles.roleChips}>
                {ROLE_OPTIONS.map(r => {
                  const selected = form.roles.includes(r.value)
                  return (
                    <label key={r.value} className={`${styles.roleChip} ${selected ? styles.roleChipSelected : ''} ${styles.checkboxWrap}`}>
                      <input className={styles.checkboxInput} type="checkbox" checked={selected} onChange={() => toggleRole(r.value)} />
                      <span className={styles.checkboxBox} aria-hidden>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      </span>
                      <span style={{fontSize:13}}>{r.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className={styles.formActions}>
              <Link href="/admin/users" className={styles.btnGhost}>Cancel</Link>
              <button className={styles.btnPrimary} type="submit" disabled={submitting}>
                {submitting ? (<><span className={styles.spinner} style={{width:16,height:16}} aria-hidden></span>&nbsp;Creating…</>) : 'Create user'}
              </button>
            </div>
          </form>

          {error && <div style={{marginTop:12}} className={styles.modalError}>{String(error)}</div>}
          {success && (
            <div style={{marginTop:12, padding:10, borderRadius:8, background:'linear-gradient(90deg, rgba(16,185,129,0.06), rgba(16,185,129,0.02))', color:'#bbf7d0'}}>
              User created successfully — <Link href="/admin/users">View users</Link>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
