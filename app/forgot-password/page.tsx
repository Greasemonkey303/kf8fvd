"use client"

import React, { useState } from 'react'
import { Card } from '@/components'
import styles from '../../styles/login.module.css'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (!email) return setError('Please enter your email')
    setLoading(true)
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const j = await res.json()
      if (!res.ok) setError(j?.error || 'Request failed')
      else setMessage('If that address exists we sent reset instructions.')
    } catch (err: unknown) {
      const e = err as Error
      setError(e?.message || String(err))
    } finally { setLoading(false) }
  }

  return (
    <main className={`${styles.authMain} page-pad`}>
      <div className={styles.center}>
        <Card id="forgot-card" title="Forgot Password" subtitle="We will email reset instructions">
          <form onSubmit={handleSubmit} className={styles.form} noValidate aria-labelledby="forgot-card-title">
            {error && <div className={styles.error} role="alert">{error}</div>}
            {message && <div className={styles.success} role="status">{message}</div>}
            <label>
              <div className={styles.label}>Email</div>
              <input
                type="email"
                value={email}
                onChange={(e)=> setEmail(e.target.value)}
                className={styles.input}
                placeholder="you@example.com"
                autoComplete="email"
                name="email"
              />
            </label>
            <div style={{display:'flex', justifyContent:'flex-end', marginTop:12}}>
              <button type="submit" className={styles.primaryButton} disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </main>
  )
}
