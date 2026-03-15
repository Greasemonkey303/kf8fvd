"use client"

import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components'
import styles from '../../styles/login.module.css'
import SegmentedOtp from '../../components/auth/SegmentedOtp'

type Props = { token?: string }

export default function ResetPasswordClient({ token: initialToken = '' }: Props){
  const router = useRouter()
  const token = initialToken || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [useShortCode, setUseShortCode] = useState(false)
  const [shortCode, setShortCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [strengthScore, setStrengthScore] = useState<number | null>(null)
  const [strengthFeedback, setStrengthFeedback] = useState<string | null>(null)
  const [pwnedCount, setPwnedCount] = useState<number | null>(null)
  const pwDebounce = useRef<number | null>(null)

  const [mounted, setMounted] = useState(false)
  useEffect(()=>{ setMounted(true) }, [])

  useEffect(()=>{
    if (token && token.length <= 6) {
      setUseShortCode(true)
      setShortCode(token)
    }
    if (!token && !useShortCode) setError('Missing token')
  }, [token])

  // password strength and HIBP checks (debounced)
  useEffect(()=>{
    if (pwDebounce.current) window.clearTimeout(pwDebounce.current)
    pwDebounce.current = window.setTimeout(async ()=>{
      const p = password || ''
      if (!p) { setStrengthScore(null); setStrengthFeedback(null); setPwnedCount(null); return }
        try {
          const zx = (await import('zxcvbn')).default as any
          const res = zx(p)
          setStrengthScore(res.score)
          const msg = (res.feedback && (res.feedback.warning || '') + ' ' + (res.feedback.suggestions || []).join(' ')) || ''
          setStrengthFeedback(msg.trim() || null)
        } catch (e) {
          setStrengthScore(null)
          setStrengthFeedback(null)
        }

      // HIBP check: compute SHA-1 prefix client-side and ask server proxy
      try {
        const enc = new TextEncoder()
        const hashBuf = await crypto.subtle.digest('SHA-1', enc.encode(p))
        const arr = Array.from(new Uint8Array(hashBuf)).map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase()
        const prefix = arr.slice(0,5)
        const res = await fetch('/api/pwned-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix }) })
        const j = await res.json()
        if (res.ok && j?.data) {
          const lines = j.data.split('\n')
          const suffix = arr.slice(5)
          let found = 0
          for (const line of lines) {
            const [s,c] = (line || '').trim().split(':')
            if (!s) continue
            if (s.toUpperCase() === suffix) { found = Number((c||'0').trim()); break }
          }
          setPwnedCount(found)
        } else {
          setPwnedCount(null)
        }
      } catch (e) {
        setPwnedCount(null)
      }
    }, 500) as unknown as number
    return ()=> { if (pwDebounce.current) window.clearTimeout(pwDebounce.current) }
  }, [password])

  async function handleSubmit(e: React.FormEvent){
    e.preventDefault()
    setError(null)
    const tokenToSend = useShortCode ? shortCode : token
    if (!tokenToSend) return setError('Missing token')
    if (password.length < 8) return setError('Password must be at least 8 characters')
    if (password !== confirm) return setError('Passwords do not match')
    if (pwnedCount && pwnedCount > 0) return setError('This password has appeared in breaches; choose another')
    setLoading(true)
    try {
      const res = await fetch('/api/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tokenToSend, password }) })
      const j = await res.json()
      if (!res.ok) return setError(j?.error || 'Reset failed')
      setSuccess(true)
      setTimeout(()=> router.push('/signin'), 1600)
    } catch (e) {
      if (e instanceof Error) setError(e.message)
      else setError('Request failed')
    }
    finally { setLoading(false) }
  }

  if (!mounted) {
    return (
      <Card id="reset-card" title="Reset Password" subtitle="Choose a new password">
        <div className={styles.form} aria-labelledby="reset-card-title" />
      </Card>
    )
  }

  return (
    <Card id="reset-card" title="Reset Password" subtitle="Choose a new password">
      <form onSubmit={handleSubmit} className={styles.form} aria-labelledby="reset-card-title" suppressHydrationWarning>
        {error && <div className={styles.error} role="alert">{error}</div>}
        {success && <div className={styles.success} role="status">Password updated — redirecting to sign in</div>}
        <label>
          <div className={styles.label}>New password</div>
          <input type="password" value={password} onChange={(e)=> setPassword(e.target.value)} className={styles.input} placeholder="New password" aria-describedby={strengthScore!=null || pwnedCount!=null ? 'pw-help' : undefined} />
          <div id="pw-help" role="status" aria-live="polite">
            {strengthScore != null && (
              <div style={{marginTop:8}}>
                <div className="fs-13" style={{marginBottom:6}}>Strength: {['Very weak','Weak','Fair','Good','Strong'][strengthScore]}</div>
                <div style={{height:8, background:'rgba(255,255,255,0.06)', borderRadius:6, overflow:'hidden'}}>
                  <div style={{width:`${(strengthScore+1)/5*100}%`, height:'100%', background: strengthScore <= 1 ? 'crimson' : strengthScore === 2 ? '#f59e0b' : '#10b981'}} />
                </div>
                {strengthFeedback && <div className={styles.smallText} style={{marginTop:6}}>{strengthFeedback}</div>}
              </div>
            )}
            {pwnedCount != null && (
              <div style={{marginTop:8}} className={pwnedCount>0?styles.error:styles.success}>{pwnedCount>0? `This password appears in ${pwnedCount} breaches — choose another.` : 'No known breaches found (quick check).'}</div>
            )}
          </div>
        </label>
        <label>
          <div className={styles.label}>Confirm password</div>
          <input type="password" value={confirm} onChange={(e)=> setConfirm(e.target.value)} className={styles.input} placeholder="Confirm password" />
        </label>

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
  )
}
