"use client"

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        await signOut({ redirect: false });
      } catch (e) {
        // ignore
      }
      try {
        // clear any client-side auth flags used previously
        localStorage.removeItem('kf8fvd_auth')
        localStorage.removeItem('kf8fvd_user')
      } catch (e) {}
      const t = setTimeout(() => router.push('/'), 600);
      return () => clearTimeout(t);
    })()
  }, [router]);

  return (
    <main className="page-pad">
      <h1>Signed Out</h1>
      <p>You have been signed out. Redirecting to home…</p>
    </main>
  );
}
