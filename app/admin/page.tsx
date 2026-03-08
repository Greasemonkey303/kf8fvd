"use client"

import React, { useEffect, useState } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import styles from './admin.module.css'

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [counts, setCounts] = useState({ projects: 0, messages: 0, users: 0, aboutPosts: 0 })
  const [featuredHero, setFeaturedHero] = useState<{ url?: string; title?: string } | null>(null)

  useEffect(()=>{
    ;(async ()=>{
      try {
        const [pRes, mRes, uRes, aboutRes] = await Promise.all([
          fetch('/api/admin/projects'),
          fetch('/api/admin/messages'),
          fetch('/api/admin/users'),
          fetch('/api/admin/pages')
        ])
        const p = await pRes.json().catch(()=>({ items:[] }))
        const m = await mRes.json().catch(()=>({ items:[] }))
        const u = await uRes.json().catch(()=>({ items:[] }))
        const a = await aboutRes.json().catch(()=>({ items:[] }))
        // count about cards across pages.metadata
        let aboutCount = 0
        try {
          const rows = Array.isArray(a.items) ? a.items : []
          for (const r of rows) {
            try {
              const md = r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : null
              if (md) {
                if (Array.isArray(md.cards) && md.cards.length > 0) aboutCount += md.cards.length
                else {
                  if (md.aboutCard) aboutCount++
                  if (md.topologyCard) aboutCount++
                  if (md.hamshackCard) aboutCount++
                }
              }
            } catch {}
          }
        } catch {}
        setCounts({ projects: (p.items||[]).length, messages: (m.items||[]).length, users: (u.items||[]).length, aboutPosts: aboutCount })
      } catch {
        // ignore
      }
    })()
    // fetch featured hero for dashboard quick card
    ;(async ()=>{
      try {
        const r = await fetch('/api/hero')
        const j = await r.json()
        const h = j?.hero || null
        const imgs = Array.isArray(j?.images) ? j.images : []
        const f = imgs.find((i:any) => Number(i.is_featured) === 1) || imgs[0] || null
        if (f) setFeaturedHero({ url: f.url, title: h?.title || '' })
      } catch {}
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
          {/* Featured hero preview — full width, centered image */}
          {featuredHero && (
            <div style={{marginBottom:12, display:'flex', justifyContent:'center'}}>
              <div className="card-action" style={{width:'100%', maxWidth:980, display:'flex', justifyContent:'center', alignItems:'center', padding:12, boxSizing:'border-box', overflow:'hidden'}}>
                <div style={{textAlign:'center', width:'100%'}}>
                  <div style={{display:'block', margin:'0 auto 8px', width:'100%', maxWidth:520, height:220, overflow:'hidden', borderRadius:12, boxSizing:'border-box'}}>
                    <img src={featuredHero.url} alt={featuredHero.title || 'Featured hero'} style={{width:'100%', height:'100%', objectFit:'cover', display:'block', maxWidth:'100%'}} />
                  </div>
                  <div style={{display:'flex', justifyContent:'center', alignItems:'center', gap:12}}>
                    <div>
                      <div className={styles.statNumber} style={{fontSize:18}}>Hero</div>
                      <div className={styles.statLabel}>{featuredHero.title || 'Featured image'}</div>
                    </div>
                    <a href="/admin/home/hero">Edit Hero</a>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className={styles.dashboardGrid} style={{marginTop:12, gridTemplateColumns: 'repeat(3, 1fr)'}}>
            <div className="card-action">
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="4" rx="1" fill="#60a5fa"/><rect x="3" y="10" width="12" height="4" rx="1" fill="#a78bfa"/><rect x="3" y="16" width="6" height="4" rx="1" fill="var(--logo-green)"/></svg>
                <div>
                  <div className={styles.statNumber}>{counts.projects}</div>
                  <div className={styles.statLabel}>Projects</div>
                </div>
              </div>
              <a href="/admin/projects">Open Projects</a>
            </div>
              <div className="card-action">
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="4" rx="1" fill="#60a5fa"/><rect x="3" y="10" width="12" height="4" rx="1" fill="#a78bfa"/><rect x="3" y="16" width="6" height="4" rx="1" fill="var(--logo-green)"/></svg>
                  <div>
                    <div className={styles.statNumber}>{counts.aboutPosts}</div>
                    <div className={styles.statLabel}>About posts</div>
                  </div>
                </div>
                <a href="/admin/about">Open About</a>
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
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="3" fill="var(--logo-green)"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="#60a5fa"/></svg>
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
