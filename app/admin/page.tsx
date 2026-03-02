"use client"

import React, { useEffect, useState } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import styles from './admin.module.css'

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [counts, setCounts] = useState({ projects: 0, messages: 0, users: 0 })

  useEffect(()=>{
    ;(async ()=>{
      try {
        const [pRes, mRes, uRes] = await Promise.all([
          fetch('/api/admin/projects'),
          fetch('/api/admin/messages'),
          fetch('/api/admin/users')
        ])
        const p = await pRes.json().catch(()=>({ items:[] }))
        const m = await mRes.json().catch(()=>({ items:[] }))
        const u = await uRes.json().catch(()=>({ items:[] }))
        setCounts({ projects: (p.items||[]).length, messages: (m.items||[]).length, users: (u.items||[]).length })
      } catch (e) {
        // ignore
      }
    })()
  }, [])

  if (status === 'loading') return <main className="page-pad"><p>Loading…</p></main>
  if (!session) {
    return (
      <main className="page-pad">
        <div className="center-max">
          <div className={styles.panel}>
            <h2>Admin</h2>
            <p>You must be signed in to access the admin console.</p>
            <div className="flex gap-2">
              <button className={styles.btnGhost} onClick={() => signIn()}>Sign In</button>
              <button className={styles.btnGhost} onClick={() => router.push('/')}>Go Home</button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="page-pad">
      <div className="center-max">
        <div className={styles.panel}>
          <h2>Admin Console</h2>
          <div className={styles.dashboardGrid} style={{marginTop:12}}>
            <div className="card-action">
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="4" rx="1" fill="#60a5fa"/><rect x="3" y="10" width="12" height="4" rx="1" fill="#a78bfa"/><rect x="3" y="16" width="6" height="4" rx="1" fill="#34d399"/></svg>
                <div>
                  <div className={styles.statNumber}>{counts.projects}</div>
                  <div className={styles.statLabel}>Projects</div>
                </div>
              </div>
              <a href="/admin/projects">Open Projects</a>
            </div>
            <div className="card-action">
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 7a2 2 0 012-2h16a2 2 0 012 2v8a2 2 0 01-2 2H6l-4 4V7z" fill="#60a5fa"/></svg>
                <div>
                  <div className={styles.statNumber}>{counts.messages}</div>
                  <div className={styles.statLabel}>Messages</div>
                </div>
              </div>
              <a href="/admin/messages">Open Messages</a>
            </div>
            <div className="card-action">
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="3" fill="#34d399"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="#60a5fa"/></svg>
                <div>
                  <div className={styles.statNumber}>{counts.users}</div>
                  <div className={styles.statLabel}>Users</div>
                </div>
              </div>
              <a href="/admin/users">Manage Users</a>
            </div>
            <div className="card-action">
              <div style={{marginTop:'auto'}}>
                <button onClick={() => signOut()} className={styles.btnGhost}>Sign Out</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
