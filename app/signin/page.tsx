"use client"

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Card } from '@/components';

export default function SignInPage() {
  const router = useRouter();
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
  const cfIntervalRef = React.useRef<number | null>(null)

  useEffect(()=>{
    if (process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY) {
      const id = 'cf-turnstile-script'
      if (!document.getElementById(id)) {
        const s = document.createElement('script')
        s.id = id
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
        s.async = true
        s.defer = true
        document.body.appendChild(s)
      }
    }
  }, [])

  useEffect(()=>{
    const sitekey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY
    if (!sitekey) return

    const tryRender = () => {
      // @ts-ignore
      if (typeof window === 'undefined' || !(window as any).turnstile) return
      const container = document.getElementById('cf-turnstile-container')
      if (!container) return
      if ((container as HTMLElement).dataset?.turnstileRendered === '1') {
        if (cfIntervalRef.current) { clearInterval(cfIntervalRef.current); cfIntervalRef.current = null }
        return
      }
      try {
        // @ts-ignore
        const id = (window as any).turnstile.render(container, {
          sitekey,
          callback: (token: string) => setCfToken(token),
        })
        setCfWidgetId(typeof id === 'number' ? id : null)
        ;(container as HTMLElement).dataset.turnstileRendered = '1'
        if (cfIntervalRef.current) { clearInterval(cfIntervalRef.current); cfIntervalRef.current = null }
      } catch (err) {
        // ignore and retry
      }
    }

    tryRender()
    cfIntervalRef.current = window.setInterval(tryRender, 500)
    return () => { if (cfIntervalRef.current) clearInterval(cfIntervalRef.current); cfIntervalRef.current = null }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError(null);
    const callback = (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('callbackUrl') : null) || '/admin'
    // include turnstile token if available
    const cfTokenVal = cfToken || (typeof window !== 'undefined' ? document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value : undefined)
    const res = await signIn('credentials', { redirect: false, email, password, callbackUrl: callback, remember: remember ? 'true' : 'false', cf_turnstile_response: cfTokenVal });
    if (res?.error) {
      setError('Invalid credentials')
      return
    }
    try {
      if (remember) localStorage.setItem('kf8fvd_remember_email', email)
      else localStorage.removeItem('kf8fvd_remember_email')
    } catch { }
    router.push(callback)
  };

  return (
    <main className="page-pad">
      <div className="center-max">
        <Card title="Sign In" subtitle="Enter your credentials">
          <form onSubmit={handleSubmit} className="form-grid" suppressHydrationWarning>
            <label>
              <div className="field-label">Email</div>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
                placeholder="you@example.com"
              />
            </label>

            <label>
              <div className="field-label">Password</div>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                placeholder="Your password"
              />
            </label>

            {process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY && (
              <div style={{marginTop:12}}>
                <div id="cf-turnstile-container"></div>
              </div>
            )}

            {error && <div className="text-red-600">{error}</div>}
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:16}}>
              <label style={{display:'flex', alignItems:'center', gap:8}}>
                <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} />
                <span style={{fontSize:13, color:'var(--white-90)'}}>Remember me</span>
              </label>
              <div>
                <button type="submit" className="btn-ghost btn-ghost-sm">Sign In</button>
              </div>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}
