"use client"

import React, { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card } from '@/components'
import styles from '../../styles/login.module.css'
import SegmentedOtp from '../../components/auth/SegmentedOtp'

export default function ResetPasswordPage(){
  const params = useSearchParams()
  const router = useRouter()
  const token = params?.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [useShortCode, setUseShortCode] = useState(false)
  const [shortCode, setShortCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(()=>{
    if (token && token.length <= 6) {
      setUseShortCode(true)
      setShortCode(token)
    }
    if (!token && !useShortCode) setError('Missing token')
  }, [token])

  async function handleSubmit(e: React.FormEvent){
    e.preventDefault()
    setError(null)
    const tokenToSend = useShortCode ? shortCode : token
    if (!tokenToSend) return setError('Missing token')
    if (password.length < 8) return setError('Password must be at least 8 characters')
    if (password !== confirm) return setError('Passwords do not match')
    setLoading(true)
    try {
      const res = await fetch('/api/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tokenToSend, password }) })
      const j = await res.json()
      if (!res.ok) return setError(j?.error || 'Reset failed')
      setSuccess(true)
      setTimeout(()=> router.push('/signin'), 1600)
    } catch (e:any) { setError(e?.message || 'Request failed') }
    finally { setLoading(false) }
  }

  return (
    <main className={`${styles.authMain} page-pad`}>
      <div className={styles.center}>
        <Card id="reset-card" title="Reset Password" subtitle="Choose a new password">
          <form onSubmit={handleSubmit} className={styles.form} suppressHydrationWarning aria-labelledby="reset-card-title">
            {error && <div className={styles.error} role="alert">{error}</div>}
            {success && <div className={styles.success} role="status">Password updated — redirecting to sign in</div>}
            <label>
              <div className={styles.label}>New password</div>
              <input type="password" value={password} onChange={(e)=> setPassword(e.target.value)} className={styles.input} placeholder="New password" suppressHydrationWarning />
            </label>
            <label>
              <div className={styles.label}>Confirm password</div>
              <input type="password" value={confirm} onChange={(e)=> setConfirm(e.target.value)} className={styles.input} placeholder="Confirm password" suppressHydrationWarning />
            </label>

            {/* Optional short-code flow: show segmented OTP when requested or when token is short */}
            <div style={{marginTop:6}}>
              {!useShortCode ? (
                <button type="button" className={styles.ghostButton} onClick={()=>{ setUseShortCode(true); setShortCode('') }}>Enter 6‑digit code instead</button>
              ) : (
                <div>
                  <div className={styles.smallText} style={{marginBottom:8}}>Enter the 6‑digit code from your email</div>
                  <SegmentedOtp length={6} value={shortCode} onChange={(v)=> setShortCode(v)} inputClassName={styles.otpCell} autoFocus />
                </div>
              )}
            </div>
            <div style={{display:'flex', justifyContent:'flex-end', marginTop:12}}>
              <button type="submit" className={styles.primaryButton} disabled={loading}>{loading? 'Updating…' : 'Update password'}</button>
            </div>
          </form>
        </Card>
      </div>
    </main>
  )
}
