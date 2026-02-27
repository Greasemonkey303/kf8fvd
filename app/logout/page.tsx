"use client"

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    try {
      localStorage.removeItem('kf8fvd_auth');
      localStorage.removeItem('kf8fvd_user');
    } catch (err) {}
    const t = setTimeout(() => router.push('/'), 600);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <main style={{padding:'2rem'}}>
      <h1>Signed Out</h1>
      <p>You have been signed out. Redirecting to home…</p>
    </main>
  );
}
