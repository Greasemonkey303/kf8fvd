"use client"

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Card } from '@/components';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError(null);
    const res = await signIn('credentials', { redirect: false, email, password });
    if (res?.error) {
      setError('Invalid credentials')
      return
    }
    router.push('/admin')
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

            <div className="flex justify-end mt-6">
              <button type="submit" className="btn-ghost btn-ghost-sm">Sign In</button>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}
