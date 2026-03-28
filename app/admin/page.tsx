"use client"

import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import styles from './admin.module.css'
import { buildPublicUrl } from '@/lib/s3'

type DashboardMessage = {
  id: number
  name?: string | null
  email?: string | null
  message?: string | null
  is_read?: boolean
  created_at?: string
}

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [counts, setCounts] = useState({ projects: 0, messages: 0, users: 0, aboutPosts: 0 })
  const [recentMessages, setRecentMessages] = useState<DashboardMessage[]>([])
  const [featuredHero, setFeaturedHero] = useState<{ url?: string; title?: string } | null>(null)
  const [onAir, setOnAir] = useState<boolean | null>(null)
  const [onairSaving, setOnairSaving] = useState(false)
  const [onairError, setOnairError] = useState<string | null>(null)
  const [onairUpdatedAt, setOnairUpdatedAt] = useState<string | null>(null)

  const mountedRef = useRef(true)

  const fetchDashboard = async () => {
    try {
      const res = await fetch('/admin/dashboard-data', { cache: 'no-store' })
      const j = await res.json().catch(() => ({ counts: null, recentMessages: [] }))
      if (!mountedRef.current) return
      setCounts({
        projects: Number(j?.counts?.projects ?? 0),
        messages: Number(j?.counts?.messages ?? 0),
        users: Number(j?.counts?.users ?? 0),
        aboutPosts: Number(j?.counts?.aboutPosts ?? 0)
      })
      setRecentMessages(Array.isArray(j?.recentMessages) ? j.recentMessages.slice(0, 5) : [])
    } catch {
      if (!mountedRef.current) return
      setRecentMessages([])
    }
  }

  const fetchOnAir = async () => {
    try {
      const r = await fetch('/admin/onair', { cache: 'no-store' })
      const j = await r.json()
      if (!mountedRef.current) return
      const isOn = j?.item && (j.item.is_on === 1 || j.item.is_on === true)
      setOnAir(Boolean(isOn))
      if (j?.item?.updated_at) setOnairUpdatedAt(String(j.item.updated_at))
    } catch {
      // ignore
    }
  }

  const fetchFeaturedHero = async () => {
    try {
      const r = await fetch('/api/hero')
      const j = await r.json()
      if (!mountedRef.current) return
      const h = j?.hero || null
      const imgs = Array.isArray(j?.images) ? (j.images as Array<Record<string, unknown>>) : []
      const f = imgs.find((i) => Number((i as Record<string, unknown>).is_featured) === 1) || imgs[0] || null
      if (!f) return
      const url = String((f as Record<string, unknown>).url || '')
      const title = String(h?.title || '')
      setFeaturedHero({ url, title })
    } catch {
      // ignore
    }
  }

  useEffect(()=>{
    const dashboardTimeoutId = window.setTimeout(() => { void fetchDashboard() }, 0)
    const featuredHeroTimeoutId = window.setTimeout(() => { void fetchFeaturedHero() }, 0)
    const timeoutId = window.setTimeout(() => { void fetchOnAir() }, 0)
    const pollId = window.setInterval(() => { void fetchDashboard() }, 30000)
    return () => {
      window.clearTimeout(dashboardTimeoutId)
      window.clearTimeout(featuredHeroTimeoutId)
      window.clearTimeout(timeoutId)
      window.clearInterval(pollId)
    }
  }, [])

  function getPreviewSrc(urlVal: unknown) {
    if (!urlVal) return ''
    const u = String(urlVal)
    if (u.startsWith('/')) return u
    if (/^https?:\/\//i.test(u)) {
      try {
        const parsed = new URL(u)
        const pclean = (parsed.pathname || '').replace(/^\//, '')
        const bucket = (process.env.NEXT_PUBLIC_S3_BUCKET || '').trim() || pclean.split('/')[0] || ''
        if (bucket && pclean.startsWith(bucket + '/')) {
          const key = pclean.slice(bucket.length + 1)
          return buildPublicUrl(key)
        }
        return u
      } catch { return u }
    }
    return buildPublicUrl(u)
  }

  async function toggleOnAir() {
    setOnairError(null)
    setOnairSaving(true)
    try {
      const newState = !onAir
      const res = await fetch('/admin/onair', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_on: newState ? 1 : 0, updated_by: session?.user?.email || null }) })
      const j = await res.json()
      if (res.ok && j?.item) setOnAir(Boolean(j.item.is_on))
      else setOnairError(j?.error || 'Failed to update')
    } catch (e) {
      setOnairError(String(e))
    }
    setOnairSaving(false)
  }

  // Poll on-air state periodically so admin sees recent status (every 10 minutes)
  useEffect(() => {
    mountedRef.current = true
    const id = setInterval(() => { if (!mountedRef.current) return; fetchOnAir() }, 10 * 60 * 1000)
    return () => { mountedRef.current = false; clearInterval(id) }
  }, [])

  if (status === 'loading') return <p>Loading…</p>
  if (!session) {
    return (
      <div className={styles.emptyStateCard}>
        <h2 className={styles.pageTitle}>Admin</h2>
        <p>You must be signed in to access the admin console.</p>
        <div className="flex gap-2">
          <button className={styles.btnGhost} onClick={() => signIn()}>Sign In</button>
          <button className={styles.btnGhost} onClick={() => router.push('/')}>Go Home</button>
        </div>
      </div>
    )
  }

  return (
    <main className={styles.pageBody}>
          <h2>Admin Console</h2>
          <div style={{display:'flex', alignItems:'center', gap:12, marginTop:8, marginBottom:12}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:700}}>On Air</div>
              <div className={styles.smallMuted}>Toggle whether the public site shows the On Air indicator.</div>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <label className={styles.switch} style={{alignItems:'center'}}>
                <input type="checkbox" checked={Boolean(onAir)} onChange={toggleOnAir} disabled={onairSaving} />
                <div className={`${styles.slider} ${onAir ? styles.on : ''}`}></div>
              </label>
              <div style={{minWidth:140, textAlign:'center'}}>
                <div style={{fontWeight:800}}>{onAir ? 'On Air' : 'Standby'}</div>
                {onairError && <div className={styles.smallMuted} style={{color:'#ffd6d6', fontSize:12}}>{onairError}</div>}
                {onairUpdatedAt && (
                  <div className={styles.smallMuted} style={{fontSize:12, marginTop:6, display:'flex', alignItems:'center', gap:8, justifyContent:'center'}}>
                    <div>
                      Last updated: {(() => {
                        try {
                          const d = new Date(String(onairUpdatedAt))
                          if (!isNaN(d.getTime())) return d.toLocaleString()
                        } catch {}
                        try { return String(onairUpdatedAt) } catch { return '' }
                      })()}
                    </div>
                    <button
                      className={`${styles.btnGhost} ${styles.btnGhostSmall}`}
                      onClick={async () => { setOnairError(null); try { await fetchOnAir() } catch (e) { setOnairError(String(e)) } }}
                      disabled={onairSaving}
                      style={{fontSize:12}}
                    >
                      Refresh
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Featured hero preview — full width, centered image */}
          {featuredHero && (
            <div style={{marginBottom:12, display:'flex', justifyContent:'center'}}>
              <div className="card-action" style={{width:'100%', maxWidth:980, display:'flex', justifyContent:'center', alignItems:'center', padding:12, boxSizing:'border-box', overflow:'hidden'}}>
                <div style={{textAlign:'center', width:'100%'}}>
                    <div style={{display:'block', margin:'0 auto 8px', width:'100%', maxWidth:520, height:220, overflow:'hidden', borderRadius:12, boxSizing:'border-box'}}>
                    <Image src={getPreviewSrc(featuredHero.url)} alt={featuredHero.title || 'Featured hero'} width={520} height={220} unoptimized style={{width:'100%', height:'100%', objectFit:'cover', display:'block', maxWidth:'100%'}} />
                  </div>
                  <div style={{display:'flex', justifyContent:'center', alignItems:'center', gap:12}}>
                    <div>
                      <div className={styles.statNumber} style={{fontSize:18}}>Hero</div>
                      <div className={styles.statLabel}>{featuredHero.title || 'Featured image'}</div>
                    </div>
                    <Link prefetch={false} href="/admin/home/hero">Edit Hero</Link>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className={styles.dashboardGrid} style={{marginTop:12}}>
            <div className="card-action">
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="4" rx="1" fill="#60a5fa"/><rect x="3" y="10" width="12" height="4" rx="1" fill="#a78bfa"/><rect x="3" y="16" width="6" height="4" rx="1" fill="var(--logo-green)"/></svg>
                <div>
                  <div className={styles.statNumber}>{counts.projects}</div>
                  <div className={styles.statLabel}>Projects</div>
                </div>
              </div>
              <Link prefetch={false} href="/admin/projects">Open Projects</Link>
            </div>
              <div className="card-action">
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="4" rx="1" fill="#60a5fa"/><rect x="3" y="10" width="12" height="4" rx="1" fill="#a78bfa"/><rect x="3" y="16" width="6" height="4" rx="1" fill="var(--logo-green)"/></svg>
                  <div>
                    <div className={styles.statNumber}>{counts.aboutPosts}</div>
                    <div className={styles.statLabel}>About posts</div>
                  </div>
                </div>
                <Link prefetch={false} href="/admin/about">Open About</Link>
              </div>
            <div className="card-action">
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 7a2 2 0 012-2h16a2 2 0 012 2v8a2 2 0 01-2 2H6l-4 4V7z" fill="#60a5fa"/></svg>
                <div>
                  <div className={styles.statNumber}>{counts.messages}</div>
                  <div className={styles.statLabel}>Messages</div>
                </div>
              </div>
              <Link prefetch={false} href="/admin/messages">Open Messages</Link>
            </div>
            <div className="card-action">
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="3" fill="var(--logo-green)"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="#60a5fa"/></svg>
                <div>
                  <div className={styles.statNumber}>{counts.users}</div>
                  <div className={styles.statLabel}>Users</div>
                </div>
              </div>
              <Link prefetch={false} href="/admin/users">Manage Users</Link>
            </div>
            <div className="card-action">
              <div style={{marginTop:'auto'}}>
                <button onClick={() => signOut()} className={styles.btnGhost}>Sign Out</button>
              </div>
            </div>
          </div>
          <div style={{marginTop:20}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:10}}>
              <h3 style={{margin:0}}>Recent Messages</h3>
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <button className={styles.btnGhost} onClick={() => { void fetchDashboard() }}>Refresh</button>
                <Link prefetch={false} href="/admin/messages">Open all messages</Link>
              </div>
            </div>
            {recentMessages.length === 0 ? (
              <div className="card-action">
                <div className={styles.smallMuted}>No messages yet.</div>
              </div>
            ) : (
              <div style={{display:'grid', gap:10}}>
                {recentMessages.map((item) => (
                  <div key={item.id} className="card-action" style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16}}>
                    <div style={{minWidth:0, flex:1}}>
                      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap'}}>
                        <strong>{item.name || 'Visitor'}</strong>
                        <span className={styles.smallMuted}>{item.email || 'No email provided'}</span>
                        {!item.is_read ? <span style={{background:'#e11d48', color:'#fff', borderRadius:999, padding:'2px 8px', fontSize:12, fontWeight:700}}>New</span> : null}
                      </div>
                      <div className={styles.smallMuted} style={{marginBottom:6}}>
                        {item.created_at ? new Date(item.created_at).toLocaleString() : '-'}
                      </div>
                      <div style={{whiteSpace:'pre-wrap', overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical'}}>
                        {String(item.message || '').trim() || 'No message body'}
                      </div>
                    </div>
                    <Link prefetch={false} href="/admin/messages">View</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
    </main>
  )
}
