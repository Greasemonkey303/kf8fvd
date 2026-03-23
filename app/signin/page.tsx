"use client"

import React, { useState, useEffect, useRef } from 'react';
import { tlog } from '@/lib/turnstileDebug';
import { loadTurnstileScript, waitForTurnstileReady, fetchTurnstileSiteKey } from '@/lib/turnstileLoader';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Card } from '@/components';
import styles from '../../styles/login.module.css'
import SegmentedOtp from '../../components/auth/SegmentedOtp'

export default function SignInPage() {
  const router = useRouter();
  const isDev = (process.env.NODE_ENV || '') !== 'production'
  const [email, setEmail] = useState<string>(() => {
    try { return localStorage.getItem('kf8fvd_remember_email') || '' } catch { return '' }
  })
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState<boolean>(() => {
    try { return Boolean(localStorage.getItem('kf8fvd_remember_email')) } catch { return false }
  })
  const [error, setError] = useState<string | null>(null);
  const [cfWidgetId, setCfWidgetId] = useState<number | null>(null)
  const [cfToken, setCfToken] = useState<string | null>(null)
  const [runtimeSiteKey, setRuntimeSiteKey] = useState<string | null>(null)
  // removed interval polling; use loader instead
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const emailRef = useRef<HTMLInputElement | null>(null)
  const [codeRequested, setCodeRequested] = useState(false)
  const [otp, setOtp] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  const getTurnstile = () => (typeof window !== 'undefined' ? (window as unknown as { turnstile?: { render?: (el: HTMLElement, opts?: { sitekey?: string; callback?: (token: string) => void }) => number | string; reset?: (id: number) => void } }).turnstile : undefined)

  useEffect(()=>{
    let cancelled = false
    const envSiteKey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY
    tlog('signin loader start', { sitekeyPresent: !!envSiteKey })

    async function init(keyToUse: string) {
      try {
        await loadTurnstileScript().catch((e)=> { tlog('signin load script failed', e); throw e })
        tlog('signin script loaded')
        await waitForTurnstileReady(8000).catch((e)=> { tlog('signin wait ready failed', e); throw e })
        if (cancelled) return
        const container = document.getElementById('cf-turnstile-container')
        if (!container) { tlog('signin: container missing after ready'); return }
        // If a widget was already rendered into this container, skip rendering again.
        try {
          const rendered = (container as HTMLElement).dataset.turnstileRendered
          if (rendered === '1') { tlog('signin: container already rendered, skipping'); return }
        } catch (e) { void e }
        try {
          const turn = getTurnstile()
          const id = turn && typeof turn.render === 'function' ? turn.render(container, {
            sitekey: keyToUse,
            callback: (token: string) => {
              tlog('signin callback token', token)
              setCfToken(token)
              try {
                const inp = document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')
                if (inp) inp.value = token
              } catch {}
            }
          }) : undefined
          tlog('signin render success', { id })
          setCfWidgetId(typeof id === 'number' ? id : null)
          ;(container as HTMLElement).dataset.turnstileRendered = '1'
        } catch (err) {
          tlog('signin render error', err)
        }
      } catch (err) {
        tlog('signin loader error', err)
      }
    }

    if (envSiteKey) init(envSiteKey)
    else {
      fetchTurnstileSiteKey().then((k)=> {
        if (cancelled) return
        if (!k) { tlog('signin: no runtime sitekey'); return }
        setRuntimeSiteKey(k)
        init(k)
      }).catch(e => tlog('signin fetch runtime sitekey failed', e))
    }

    return () => { cancelled = true }
  }, [])

  // autofocus email input on mount
  useEffect(()=>{
    try { emailRef.current?.focus() } catch {}
  }, [])

  // countdown for resend cooldown
  useEffect(()=>{
    if (!resendCooldown) return
    const t = window.setInterval(()=>{
      setResendCooldown(c=> {
        if (c <= 1) { window.clearInterval(t); return 0 }
        return c - 1
      })
    }, 1000)
    return ()=> window.clearInterval(t)
  }, [resendCooldown])

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

  const sitekeyNow = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY || runtimeSiteKey

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    // client-side validation
    if (!email || !isValidEmail(email)) {
      setFieldErrors({ email: 'Please enter a valid email address.' })
      try { emailRef.current?.focus() } catch {}
      return
    }
    if (!password) {
      setFieldErrors({ password: 'Please enter your password.' })
      return
    }

    // Ensure Turnstile token present before sending when requesting code
    const cfTokenVal = cfToken || (typeof window !== 'undefined' ? document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value : undefined)
    let useBypass = false
    if (!cfTokenVal) {
      if (isDev) {
        tlog('signin handleSubmit: no token present; enabling dev bypass')
        useBypass = true
      } else {
        tlog('signin handleSubmit: missing token', { cfToken, cfTokenVal })
        setError('Please complete the CAPTCHA to continue.')
        return
      }
    }

    // Request a 2FA code to be emailed.
    setLoading(true)
    try {
      const payload: Record<string, unknown> = { email, password }
      if (cfTokenVal) payload.cf_turnstile_response = cfTokenVal
      if (useBypass) payload._bypass = '1'
      const res = await fetch('/api/auth/2fa/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json()
      if (!res.ok || j?.error) {
        setError(j?.error || 'Sign in request failed')
        try { const t = getTurnstile(); if (t && cfWidgetId != null && typeof t.reset === 'function') t.reset(cfWidgetId) } catch {}
        setCfToken(null)
        return
      }
      setCodeRequested(true)
      setResendCooldown(45)
      try { if (remember) localStorage.setItem('kf8fvd_remember_email', email) } catch {}
    } catch (err) {
      if (err instanceof Error) setError(err.message)
      else setError('Request failed')
    } finally { setLoading(false) }
  }

  // Primary form action: either request code (initial) or verify OTP (when codeRequested)
  const handlePrimary = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!codeRequested) return handleSubmit(e)
    return handleVerify()
  }

  // Verify OTP and complete sign-in using next-auth credentials provider
  const handleVerify = async () => {
    setError(null)
    if (!otp || otp.trim().length === 0) return setError('Enter the 6-digit code')
    setLoading(true)
    try {
      const callback = (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('callbackUrl') : null) || '/admin'
      const res = await signIn('credentials', { redirect: false, email, password, otp: otp.trim(), callbackUrl: callback, remember: remember ? 'true' : 'false' })
      if (res?.error) {
        setError(res.error || 'Verification failed')
        return
      }
      try { if (remember) localStorage.setItem('kf8fvd_remember_email', email) } catch {}
      router.push(callback)
    } catch (err) { if (err instanceof Error) setError(err.message); else setError('Verification failed') }
    finally { setLoading(false) }
  }

  const handleResend = async () => {
    if (resendCooldown > 0) return
    setLoading(true)
    try {
      const payload: Record<string, unknown> = { email, password }
      if (cfToken) payload.cf_turnstile_response = cfToken
      else if (isDev) payload._bypass = '1'
      const res = await fetch('/api/auth/2fa/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json()
      if (!res.ok || j?.error) return setError(j?.error || 'Resend failed')
      setResendCooldown(45)
    } catch (e) { if (e instanceof Error) setError(e.message); else setError('Resend failed') }
    finally { setLoading(false) }
  }

  return (
    <main className={`${styles.authMain} page-pad`}>
      <div className={styles.center}>
        <Card id="signin-card" title="Sign In" subtitle="Enter your credentials">
          <form onSubmit={handlePrimary} className={styles.form} suppressHydrationWarning aria-labelledby="signin-card-title">
            <div>
              <label>
                <div className={styles.label}>Email</div>
                <input
                  name="email"
                  ref={emailRef}
                  autoComplete="email"
                  required
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: undefined })); }}
                  className={styles.input}
                  placeholder="you@example.com"
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? 'err-email' : undefined}
                />
              </label>
              {fieldErrors.email && <div id="err-email" className={styles.error} role="alert">{fieldErrors.email}</div>}
            </div>

            <div>
              <label>
                <div className={styles.label}>Password</div>
                <div className={styles.otpRow}>
                  <input
                    name="password"
                    autoComplete="current-password"
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: undefined })); }}
                    className={styles.input}
                    placeholder="Your password"
                    aria-invalid={!!fieldErrors.password}
                    aria-describedby={fieldErrors.password ? 'err-password' : undefined}
                  />
                  <button type="button" onClick={() => setShowPassword(s => !s)} aria-pressed={showPassword} className={styles.ghostButton}>{showPassword ? 'Hide' : 'Show'}</button>
                </div>
              </label>
              {fieldErrors.password && <div id="err-password" className={styles.error} role="alert">{fieldErrors.password}</div>}
              <div style={{marginTop:8}}><a href="/forgot-password" className={styles.helperLink}>Forgot password?</a></div>
            </div>

            {(process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY || runtimeSiteKey) && (
              <div className={styles.turnstile} role="region" aria-describedby="turnstile-desc">
                <div id="cf-turnstile-container" aria-hidden={false}></div>
                <input type="hidden" name="cf-turnstile-response" />
                <div id="turnstile-desc" className={styles.smallText}>Complete the CAPTCHA to continue.</div>
              </div>
            )}

            {error && <div className={styles.error} role="alert" aria-live="assertive">{error}</div>}
            {codeRequested && <div className={styles.success} role="status">A verification code was sent to your email. Enter it below to finish signing in.</div>}
            {codeRequested && (
              <div style={{marginTop:12}}>
                <div className={styles.label}>Verification code</div>
                <div className={styles.otpDigits}>
                  <SegmentedOtp length={6} value={otp} onChange={(v)=> setOtp(v)} autoFocus inputClassName={styles.otpCell} />
                </div>
                <div style={{display:'flex', gap:8, marginTop:8}}>
                  <button type="button" onClick={handleResend} className={styles.ghostButton} disabled={resendCooldown>0 || loading}>{resendCooldown>0 ? `Resend (${resendCooldown})` : 'Resend code'}</button>
                </div>
              </div>
            )}
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:16}}>
              <label className={styles.switch}>
                <input type="checkbox" name="remember" className={styles.switchInput} checked={remember} onChange={e=>setRemember(e.target.checked)} aria-label="Remember me" />
                <span className={styles.switchTrack}><span className={styles.switchThumb} aria-hidden /></span>
                <span className={styles.smallText}>Remember me</span>
              </label>
              <div>
                <button type="submit" className={styles.primaryButton} disabled={loading || ((!codeRequested && sitekeyNow && !cfToken && !isDev)) || (codeRequested && otp.trim().length < 6)} aria-disabled={loading || ((!codeRequested && sitekeyNow && !cfToken && !isDev)) || (codeRequested && otp.trim().length < 6)}>
                  {loading ? (
                    <span style={{display:'inline-flex', alignItems:'center', gap:8}}>
                      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{marginRight:6}}>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" fill="none" />
                        <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none">
                          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" />
                        </path>
                      </svg>
                      {codeRequested ? 'Verifying…' : 'Signing in…'}
                    </span>
                  ) : (codeRequested ? 'Verify & Sign In' : 'Sign In')}
                </button>
              </div>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}
