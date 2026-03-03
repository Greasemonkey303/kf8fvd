import { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireAdmin } from '../../lib/auth'
import styles from './admin.module.css'
import ToastProvider from '../../components/toast/ToastProvider'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin()
  if (!admin) {
    return (
      <main className="page-pad">
        <div className="center-max">
          <div style={{maxWidth:720}}>
            <h2>Admin</h2>
            <p>You must be logged in as an administrator to view this page.</p>
            <p><a href="/signin">Sign In</a> or <a href="/">Return home</a></p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <div className={styles.adminRoot}>
      <aside className={`${styles.sidebar} accent-scroll`}>
        <a href="/admin" className={styles.brandButton} aria-label="Admin Home">kf8fvd — Admin</a>
        <nav>
          <a className={styles.navLink} href="/admin/projects">Projects</a>
          <a className={styles.navLink} href="/admin/messages">Messages</a>
          <a className={styles.navLink} href="/admin">Dashboard</a>
          <a className={styles.navLink} href="/">View site</a>
        </nav>
        <div style={{marginTop:18}} className={styles.smallMuted}>Signed in as</div>
        <div style={{marginTop:6, fontWeight:600}}>{admin.name || admin.email}</div>
      </aside>

      <div className={styles.contentWrap}>
        <div className={styles.topbar}>
          <div className={styles.topTitle}>Admin</div>
        </div>
        <ToastProvider>
          <div className={styles.panel}>
            {children}
          </div>
        </ToastProvider>
      </div>
    </div>
  )
}
