import { ReactNode } from 'react'
import Link from 'next/link'
import { requireAdmin } from '../../lib/auth'
import styles from './admin.module.css'
import ToastProvider from '../../components/toast/ToastProvider'
import AdminSidebar from '../../components/admin/AdminSidebar'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin()
  if (!admin) {
    return (
      <main className="page-pad">
        <div className="center-max">
          <div className={styles.authGate}>
            <h2>Admin</h2>
            <p>You must be logged in as an administrator to view this page.</p>
            <p><Link href="/signin">Sign In</Link> or <Link href="/">Return home</Link></p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <div className={styles.adminRoot}>
      <AdminSidebar admin={admin} />

      <div className={styles.contentWrap}>
        <div className={styles.topbar}>
          <div className={styles.topTitle}>Admin</div>
        </div>
        <ToastProvider>
          <div className={styles.shellPanel}>
            <div className={styles.pageContent}>
              {children}
            </div>
          </div>
        </ToastProvider>
      </div>
    </div>
  )
}
