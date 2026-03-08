"use client"

import React from 'react'
import { usePathname } from 'next/navigation'
import styles from '../../app/admin/admin.module.css'

export default function AdminSidebar({ admin }: { admin: { name?: string; email?: string } | null }) {
  const pathname = usePathname() || ''
  const isActive = (href: string) => pathname.startsWith(href)

  return (
    <aside className={`${styles.sidebar} accent-scroll`}>
      <a href="/admin" className={styles.brandButton} aria-label="Admin Home">KF8FVD — Admin</a>
      <nav>
        <a className={`${styles.navLink} ${isActive('/admin/projects') ? styles.navLinkActive : ''}`} href="/admin/projects">Projects</a>
        <a className={`${styles.navLink} ${isActive('/admin/credentials') ? styles.navLinkActive : ''}`} href="/admin/credentials">Credentials</a>
        <a className={`${styles.navLink} ${isActive('/admin/about') ? styles.navLinkActive : ''}`} href="/admin/about">About</a>
        <a className={`${styles.navLink} ${isActive('/admin/messages') ? styles.navLinkActive : ''}`} href="/admin/messages">Messages</a>
        <a className={`${styles.navLink} ${isActive('/admin/home') ? styles.navLinkActive : ''}`} href="/admin/home">Home</a>
        <div className={styles.navSubList}>
          <a className={`${styles.navLink} ${styles.navSubLink} ${isActive('/admin/home/hero') ? styles.navLinkActive : ''}`} href="/admin/home/hero">Hero</a>
        </div>
        <a className={`${styles.navLink} ${isActive('/admin') && pathname === '/admin' ? styles.navLinkActive : ''}`} href="/admin">Dashboard</a>
        <a className={styles.navLink} href="/">View site</a>
      </nav>
      <div style={{marginTop:18}} className={styles.smallMuted}>Signed in as</div>
      <div style={{marginTop:6, fontWeight:600}}>{admin?.name || admin?.email}</div>
    </aside>
  )
}
