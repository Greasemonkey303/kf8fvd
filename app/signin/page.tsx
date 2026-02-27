"use client"

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    // simple stub auth: save to localStorage
    try {
      localStorage.setItem('kf8fvd_auth', '1');
      // derive a display name from the email if possible
      const display = email.split('@')[0] || email;
      const nice = display.charAt(0).toUpperCase() + display.slice(1);
      localStorage.setItem('kf8fvd_user', nice);
    } catch (err) {
      // ignore
    }
    router.push('/');
  };

  return (
    <main style={{padding: '2rem'}}>
      <div style={{maxWidth: 540, margin: '0 auto'}}>
        <Card title="Sign In" subtitle="Enter your credentials">
          <form onSubmit={handleSubmit} style={{display: 'grid', gap: 12}}>
            <label style={{display:'block'}}>
              <div style={{marginBottom:6, fontSize:13}}>Email</div>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{display:'block', width:'100%', padding:10, borderRadius:8, border:'1px solid rgba(255,255,255,0.06)', background:'transparent', color:'inherit'}}
                placeholder="you@example.com"
              />
            </label>

            <label style={{display:'block'}}>
              <div style={{marginBottom:6, fontSize:13}}>Password</div>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{display:'block', width:'100%', padding:10, borderRadius:8, border:'1px solid rgba(255,255,255,0.06)', background:'transparent', color:'inherit'}}
                placeholder="Your password"
              />
            </label>

            <div style={{display:'flex', justifyContent:'flex-end', marginTop:6}}>
              <button type="submit" style={{padding:'8px 14px', borderRadius:8}}>Sign In</button>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}
