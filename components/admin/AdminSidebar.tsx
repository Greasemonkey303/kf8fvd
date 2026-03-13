"use client"

import React, { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import styles from '../../app/admin/admin.module.css'

export default function AdminSidebar({ admin }: { admin: { name?: string; email?: string } | null }) {
  const pathname = usePathname() || ''
  const isActive = (href: string) => pathname.startsWith(href)
  const [unread, setUnread] = useState<number>(0)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/admin/messages?unread=true')
        const j = await res.json()
        if (!mounted) return
        if (j && typeof j.unread === 'number') setUnread(Number(j.unread))
      } catch (e) {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [])

  return (
    <aside className={`${styles.sidebar} accent-scroll`}>
      <a href="/admin" className={styles.brandButton} aria-label="Admin Home">KF8FVD — Admin</a>
      <nav>
        <a className={`${styles.navLink} ${isActive('/admin/projects') ? styles.navLinkActive : ''}`} href="/admin/projects">Projects</a>
        <a className={`${styles.navLink} ${isActive('/admin/credentials') ? styles.navLinkActive : ''}`} href="/admin/credentials">Credentials</a>
        <a className={`${styles.navLink} ${isActive('/admin/about') ? styles.navLinkActive : ''}`} href="/admin/about">About</a>
        <a className={`${styles.navLink} ${isActive('/admin/messages') ? styles.navLinkActive : ''}`} href="/admin/messages">Messages{unread>0 && <span style={{background:'#e11d48',color:'#fff',borderRadius:999,padding:'2px 6px',marginLeft:8,fontSize:12}}>{unread}</span>}</a>
        <a className={`${styles.navLink} ${isActive('/admin/home') ? styles.navLinkActive : ''}`} href="/admin/home">Home</a>
        <div className={styles.navSubList}>
          <a className={`${styles.navLink} ${styles.navSubLink} ${isActive('/admin/home/hero') ? styles.navLinkActive : ''}`} href="/admin/home/hero">Hero</a>
        </div>
        <a className={`${styles.navLink} ${isActive('/admin') && pathname === '/admin' ? styles.navLinkActive : ''}`} href="/admin">Dashboard</a>
        <a className={`${styles.navLink} ${isActive('/admin/utilities') ? styles.navLinkActive : ''}`} href="/admin/utilities">Utilities</a>
        <div className={styles.navSubList}>
          <a className={`${styles.navLink} ${styles.navSubLink} ${isActive('/admin/utilities/locks') ? styles.navLinkActive : ''}`} href="/admin/utilities/locks">Locks</a>
          <a className={`${styles.navLink} ${styles.navSubLink} ${isActive('/admin/utilities/login-attempts') ? styles.navLinkActive : ''}`} href="/admin/utilities/login-attempts">Login Attempts</a>
          <a className={`${styles.navLink} ${styles.navSubLink} ${isActive('/admin/audit') ? styles.navLinkActive : ''}`} href="/admin/audit">Audit Log</a>
        </div>
        <a className={styles.navLink} href="/">View site</a>
      </nav>
      <div style={{marginTop:18}} className={styles.smallMuted}>Signed in as</div>
      <div style={{marginTop:6, fontWeight:600}}>{admin?.name || admin?.email}</div>
    </aside>
  )
}
