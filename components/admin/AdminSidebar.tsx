"use client"

import React, { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import styles from '../../app/admin/admin.module.css'

export default function AdminSidebar({ admin }: { admin: { name?: string; email?: string } | null }) {
  const pathname = usePathname() || ''
  const isActive = (href: string) => pathname.startsWith(href)
  const [unread, setUnread] = useState<number>(0)

  useEffect(() => {
    let mounted = true
    const loadUnread = async () => {
      try {
        const res = await fetch('/api/admin/messages?unread=true', { cache: 'no-store' })
        const j = await res.json()
        if (!mounted) return
        if (j && typeof j.unread === 'number') setUnread(Number(j.unread))
      } catch {
        // ignore
      }
    }
    void loadUnread()
    const pollId = window.setInterval(() => { void loadUnread() }, 30000)
    return () => {
      mounted = false
      window.clearInterval(pollId)
    }
  }, [])

  return (
    <aside className={`${styles.sidebar} accent-scroll`}>
      <Link href="/admin" prefetch={false} className={styles.brandButton} aria-label="Admin Home">KF8FVD — Admin</Link>
      <nav>
        <Link prefetch={false} className={`${styles.navLink} ${isActive('/admin/projects') ? styles.navLinkActive : ''}`} href="/admin/projects">Projects</Link>
        <Link prefetch={false} className={`${styles.navLink} ${isActive('/admin/credentials') ? styles.navLinkActive : ''}`} href="/admin/credentials">Credentials</Link>
        <Link prefetch={false} className={`${styles.navLink} ${isActive('/admin/about') ? styles.navLinkActive : ''}`} href="/admin/about">About</Link>
        <Link prefetch={false} className={`${styles.navLink} ${isActive('/admin/messages') ? styles.navLinkActive : ''}`} href="/admin/messages">Messages{unread>0 && <span className={styles.unreadBadge}>{unread}</span>}</Link>
        <Link prefetch={false} className={`${styles.navLink} ${isActive('/admin/home/hero') ? styles.navLinkActive : ''}`} href="/admin/home/hero">Home</Link>
        <div className={styles.navSubList}>
          <Link prefetch={false} className={`${styles.navLink} ${styles.navSubLink} ${isActive('/admin/home/hero') ? styles.navLinkActive : ''}`} href="/admin/home/hero">Hero</Link>
        </div>
        <Link prefetch={false} className={`${styles.navLink} ${isActive('/admin') && pathname === '/admin' ? styles.navLinkActive : ''}`} href="/admin">Dashboard</Link>
        <Link prefetch={false} className={`${styles.navLink} ${isActive('/admin/utilities') ? styles.navLinkActive : ''}`} href="/admin/utilities">Utilities</Link>
        <div className={styles.navSubList}>
          <Link prefetch={false} className={`${styles.navLink} ${styles.navSubLink} ${isActive('/admin/utilities/locks') ? styles.navLinkActive : ''}`} href="/admin/utilities/locks">Locks</Link>
          <Link prefetch={false} className={`${styles.navLink} ${styles.navSubLink} ${isActive('/admin/utilities/login-attempts') ? styles.navLinkActive : ''}`} href="/admin/utilities/login-attempts">Login Attempts</Link>
          <Link prefetch={false} className={`${styles.navLink} ${styles.navSubLink} ${isActive('/admin/utilities/call-log') ? styles.navLinkActive : ''}`} href="/admin/utilities/call-log">Call Log</Link>
          <Link prefetch={false} className={`${styles.navLink} ${styles.navSubLink} ${isActive('/admin/utilities/create-user') ? styles.navLinkActive : ''}`} href="/admin/utilities/create-user">Create User</Link>
          <Link prefetch={false} className={`${styles.navLink} ${styles.navSubLink} ${isActive('/admin/audit') ? styles.navLinkActive : ''}`} href="/admin/audit">Audit Log</Link>
        </div>
        <Link prefetch={false} className={styles.navLink} href="/">View site</Link>
      </nav>
      <div className={`${styles.smallMuted} ${styles.signedInLabel}`}>Signed in as</div>
      <div className={styles.signedInValue}>{admin?.name || admin?.email}</div>
    </aside>
  )
}
