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
    <main className="page-pad">
      <div className="center-max">
        <Card title="Sign In" subtitle="Enter your credentials">
          <form onSubmit={handleSubmit} className="form-grid">
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

            <div className="flex justify-end mt-6">
              <button type="submit" className="btn-ghost btn-ghost-sm">Sign In</button>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}
