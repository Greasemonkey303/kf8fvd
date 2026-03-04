"use client"

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Card } from '@/components';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null);

  useEffect(()=>{
    try {
      const saved = localStorage.getItem('kf8fvd_remember_email')
      if (saved) { setEmail(saved); setRemember(true) }
    } catch (e) {}
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError(null);
    const callback = (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('callbackUrl') : null) || '/admin'
    const res = await signIn('credentials', { redirect: false, email, password, callbackUrl: callback, remember: remember ? 'true' : 'false' });
    if (res?.error) {
      setError('Invalid credentials')
      return
    }
    try {
      if (remember) localStorage.setItem('kf8fvd_remember_email', email)
      else localStorage.removeItem('kf8fvd_remember_email')
    } catch (e) {}
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
